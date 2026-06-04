import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from "viem";
import { celo, celoSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { ERC20_ABI } from "@/lib/abi";
import { checkAgentAuth } from "@/lib/agentAuth";
import { settlementStore } from "@/lib/settlementStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Closes the fiat → cUSD loop. Stripe calls this after a card payment succeeds;
 * we verify the signature, then the treasury wallet sends the equivalent cUSD to
 * the agent's wallet on Celo. The existing /api/watch stream then catches it.
 *
 * Exactly-once is enforced by settlementStore (durable KV lease in production):
 *   claim → settle on-chain → markSettled, releasing only if the transfer fails.
 *
 * Requires (server-only): STRIPE_WEBHOOK_SECRET, TREASURY_PRIVATE_KEY.
 * Recommended for prod: KV_REST_API_URL / KV_REST_API_TOKEN (see settlementStore).
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY as `0x${string}` | undefined;

  if (!webhookSecret || !treasuryKey) {
    return NextResponse.json(
      {
        error:
          "Settlement not configured. Set STRIPE_WEBHOOK_SECRET and TREASURY_PRIVATE_KEY in web/.env.local to enable card→cUSD settlement.",
      },
      { status: 503 },
    );
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig || !verifyStripeSignature(payload, sig, webhookSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (!session.id) {
    return NextResponse.json({ error: "missing session id" }, { status: 400 });
  }
  if (session.payment_status && session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  // ── Validate settlement intent BEFORE claiming (a malformed event should 400,
  //    not consume an idempotency slot). ──
  const md = session.metadata ?? {};
  const agentWallet = md.agentWallet as Address | undefined;
  const asset = (md.asset as AssetKey) ?? "cUSD";
  const amount = md.amount ?? "0";
  const chainId = md.chainId ? Number(md.chainId) : NaN;

  if (!agentWallet || !Number.isFinite(chainId) || Number(amount) <= 0) {
    return NextResponse.json({ error: "missing/invalid settlement metadata" }, { status: 400 });
  }

  let chain;
  try {
    chain = getCeloChain(chainId);
  } catch {
    return NextResponse.json({ error: `unsupported chain ${chainId}` }, { status: 400 });
  }
  const assetInfo = chain.assets[asset];
  if (!assetInfo) return NextResponse.json({ error: "bad asset" }, { status: 400 });
  // Card was charged in USD — only settle USD-pegged assets 1:1 (no FX).
  if (asset === "cEUR") {
    return NextResponse.json({ error: "unsupported settlement asset" }, { status: 400 });
  }

  // ── Idempotency: claim the session before any fund movement. ──
  let claim;
  try {
    claim = await settlementStore.claim(session.id);
  } catch (err) {
    // KV unreachable: don't settle blind (could double-pay). 503 → Stripe retries.
    return NextResponse.json(
      { error: `idempotency store unavailable: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 503 },
    );
  }

  if (claim.state === "settled") {
    return NextResponse.json({
      received: true,
      deduped: true,
      settled: true,
      txHash: claim.txHash,
      explorerTx: claim.txHash ? `${chain.explorer}/tx/${claim.txHash}` : undefined,
    });
  }
  if (claim.state === "pending") {
    // Another delivery of this event is mid-settlement. Non-2xx → Stripe retries;
    // by then the in-flight worker has settled (→ deduped) or released (→ retry wins).
    return NextResponse.json(
      { received: true, inFlight: true, message: "settlement already in progress; retry" },
      { status: 409 },
    );
  }

  // claim.state === "claimed" → we own it. Settle on-chain.
  let txHash: `0x${string}`;
  try {
    const account = privateKeyToAccount(treasuryKey);
    const viemChain = chainId === celo.id ? celo : celoSepolia;
    const walletClient = createWalletClient({ account, chain: viemChain, transport: http(chain.rpcUrl) });
    const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });

    const value = parseUnits(amount, assetInfo.decimals);
    txHash = await walletClient.writeContract({
      account,
      chain: viemChain,
      address: assetInfo.address,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [agentWallet, value],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    // Transfer never landed → release so a Stripe retry can try again.
    await settlementStore.release(session.id).catch(() => {});
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "settlement failed" },
      { status: 502 },
    );
  }

  // Transfer succeeded. Record it permanently — but NEVER turn a record-write
  // failure into a non-2xx, or Stripe would retry and double-pay. Worst case the
  // lease simply expires; since we return 2xx, Stripe won't redeliver anyway.
  await settlementStore.markSettled(session.id, txHash).catch((err) => {
    console.error(
      `[stripe/webhook] settled ${txHash} but failed to persist idempotency record for ${session.id}:`,
      err instanceof Error ? err.message : err,
    );
  });

  return NextResponse.json({
    settled: true,
    txHash,
    to: agentWallet,
    amount,
    asset,
    explorerTx: `${chain.explorer}/tx/${txHash}`,
    idempotency: settlementStore.backend,
  });
}

/**
 * Verification / readiness probe — does NOT move funds. Lets you confirm the
 * webhook is reachable and correctly wired before pointing Stripe at it.
 *
 *   - unauthenticated: coarse config booleans only.
 *   - authenticated (Authorization: Bearer AGENT_RUNTIME_SECRET, like the other
 *     fund-touching endpoints): also resolves the treasury address + balances so
 *     you can see it can actually cover a settlement.
 */
export async function GET(req: NextRequest) {
  const webhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY as `0x${string}` | undefined;

  const config = {
    ok: webhookSecret && Boolean(treasuryKey),
    stripeWebhookSecret: webhookSecret,
    treasuryKey: Boolean(treasuryKey),
    idempotency: {
      backend: settlementStore.backend,
      durable: settlementStore.durable,
    },
    defaultChainId: DEFAULT_CHAIN_ID,
  };

  // checkAgentAuth returns null when the caller is allowed (dev w/o secret, or a
  // matching bearer); a NextResponse when it isn't. Use it only as a gate here.
  const authed = checkAgentAuth(req) === null;
  if (!authed || !treasuryKey) {
    return NextResponse.json(config);
  }

  try {
    const chain = getCeloChain(DEFAULT_CHAIN_ID);
    const cusd = chain.assets.cUSD;
    const account = privateKeyToAccount(treasuryKey);
    const viemChain = DEFAULT_CHAIN_ID === celo.id ? celo : celoSepolia;
    const publicClient = createPublicClient({ chain: viemChain, transport: http(chain.rpcUrl) });

    const [native, cusdBal] = await Promise.all([
      publicClient.getBalance({ address: account.address }),
      publicClient.readContract({
        address: cusd.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }) as Promise<bigint>,
    ]);

    return NextResponse.json({
      ...config,
      treasury: {
        address: account.address,
        chain: chain.name,
        celo: formatEther(native),
        cUSD: formatUnits(cusdBal, cusd.decimals),
        // Needs gas (native CELO) AND cUSD to settle a card payment.
        readyToSettle: native > 0n && cusdBal > 0n,
        explorer: `${chain.explorer}/address/${account.address}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ...config, treasuryError: err instanceof Error ? err.message : "balance read failed" },
      { status: 502 },
    );
  }
}

/** Verify a Stripe-Signature header (t=…,v1=…) with a 5-minute replay tolerance. */
function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  // Replay protection.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

interface StripeEvent {
  type: string;
  data: {
    object: {
      id?: string;
      payment_status?: string;
      metadata?: Record<string, string>;
    };
  };
}
