import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  decodeEventLog,
  formatUnits,
  isAddress,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { turnkeyConfigured, celoPublicClient, turnkeyClients } from "@/lib/turnkey";
import { checkAgentAuth } from "@/lib/agentAuth";
import {
  ENVOY_FACILITATOR_ABI,
  ERC8004_IDENTITY_ABI,
  paymentAuthTypedData,
  type PaymentAuth,
} from "@/lib/abi";
import { getEnvoyAddresses } from "@/lib/contracts";
import { getCeloChain } from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Settle a payment fully from the enclave: the agent's Turnkey key signs the
 * EIP-712 PaymentAuth AND submits pay() (paying its own gas). No browser wallet
 * is involved — this is what an autonomous agent runtime would call.
 *
 * NOTE: this is a demo endpoint with no caller auth — anyone who can reach it can
 * trigger a payment from the agent, bounded by the on-chain spending policy
 * (setLimit) which is the hard cap. A production deployment would authenticate
 * the agent runtime; the on-chain limit remains the backstop either way.
 */
export async function POST(req: NextRequest) {
  const denied = checkAgentAuth(req);
  if (denied) return denied;
  if (!turnkeyConfigured()) {
    return NextResponse.json({ error: "Turnkey not configured." }, { status: 503 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const chainId = Number(body.chainId);
    const agentId = String(body.agentId ?? "");
    const merchant = body.merchant;
    const amount = String(body.amount ?? "");

    if (!Number.isInteger(chainId)) throw new Error("Invalid chainId.");
    if (!/^\d+$/.test(agentId)) throw new Error("Invalid agentId.");
    if (typeof merchant !== "string" || !isAddress(merchant)) throw new Error("Invalid merchant.");
    if (!/^\d*\.?\d+$/.test(amount)) throw new Error("Invalid amount.");

    const { facilitator, identityRegistry } = getEnvoyAddresses(chainId);
    if (facilitator === ZERO) throw new Error("Facilitator not deployed on this chain.");
    const chain = getCeloChain(chainId);
    const token = chain.assets.cUSD.address;
    const decimals = chain.assets.cUSD.decimals;
    const value = parseUnits(amount, decimals);
    if (value <= 0n) throw new Error("Amount must be greater than zero.");

    const reader = celoPublicClient(chainId);
    const agentWallet = (await reader.readContract({
      address: identityRegistry,
      abi: ERC8004_IDENTITY_ABI,
      functionName: "getAgentWallet",
      args: [BigInt(agentId)],
    })) as Address;
    if (!isAddress(agentWallet) || agentWallet === ZERO) {
      throw new Error(`Agent #${agentId} has no signing wallet set.`);
    }

    const auth: PaymentAuth = {
      agentId: BigInt(agentId),
      token,
      merchant: merchant as Address,
      amount: value,
      challengeId: toHex(randomBytes(32)) as Hex,
      nonce: BigInt(toHex(randomBytes(32))),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };

    const { account, walletClient, publicClient } = await turnkeyClients(agentWallet, chainId);

    // 1 — the enclave signs the payment authorization (off-chain, no gas)
    const signature = await account.signTypedData(
      paymentAuthTypedData({ chainId, facilitator, auth }),
    );

    // 2 — the enclave submits pay() (on-chain, agent pays gas)
    const txHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: facilitator,
      abi: ENVOY_FACILITATOR_ABI,
      functionName: "pay",
      args: [auth, signature],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    let fee = 0n;
    let settledAmount = value;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== facilitator.toLowerCase()) continue;
      try {
        const d = decodeEventLog({ abi: ENVOY_FACILITATOR_ABI, data: log.data, topics: log.topics });
        if (d.eventName === "Settled") {
          const a = d.args as { amount: bigint; fee: bigint };
          settledAmount = a.amount;
          fee = a.fee;
        }
      } catch {
        /* not Settled */
      }
    }

    return NextResponse.json(
      {
        txHash,
        agentWallet,
        merchant,
        amount: formatUnits(settledAmount, decimals),
        fee: formatUnits(fee, decimals),
        net: formatUnits(settledAmount - fee, decimals),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Turnkey pay failed." },
      { status: 502 },
    );
  }
}
