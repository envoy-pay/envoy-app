"use client";

import { useEffect, useState } from "react";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { celo } from "viem/chains";
import { Masthead } from "@/app/_components/Masthead";
import { useWallet } from "@/app/_components/WalletProvider";
import { connectWallet } from "@/lib/wallet";
import { getEnvoyAddresses } from "@/lib/contracts";
import {
  ERC20_ABI,
  ERC8004_IDENTITY_ABI,
  ENVOY_FACILITATOR_ABI,
  paymentAuthTypedData,
  type PaymentAuth,
} from "@/lib/abi";
import { CELO_MAINNET, getCeloChain } from "@/lib/chains";

// The facilitator is deployed on Celo Mainnet only — pay-out runs there.
const CHAIN_ID = CELO_MAINNET;
const PERIOD = 86_400; // 1-day spending window for the demo policy
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// Keyless read client for Turnkey mode (resolve wallet / limits — no wallet connect).
const READ_CLIENT = createPublicClient({
  chain: celo,
  transport: http(getCeloChain(CHAIN_ID).rpcUrl),
});

type StepState = "idle" | "active" | "done" | "skip" | "error";
interface Step {
  key: string;
  label: string;
  state: StepState;
  note?: string;
}

const STEPS: Step[] = [
  { key: "connect", label: "Connect & verify signing wallet", state: "idle" },
  { key: "limit", label: "Spending policy on-chain", state: "idle" },
  { key: "approve", label: "Approve cUSD allowance", state: "idle" },
  { key: "sign", label: "Sign EIP-712 payment authorization", state: "idle" },
  { key: "settle", label: "EnvoyFacilitator.pay() settles", state: "idle" },
];

// Full enclave autonomy: the agent's Turnkey key signs + submits everything;
// no browser wallet. Mirrors what an autonomous agent runtime would do.
const STEPS_TK: Step[] = [
  { key: "resolve", label: "Resolve agent's enclave wallet", state: "idle" },
  { key: "limit", label: "Check on-chain spending policy", state: "idle" },
  { key: "approve", label: "Approve cUSD (enclave-signed)", state: "idle" },
  { key: "settle", label: "Sign & settle pay() in enclave", state: "idle" },
];

type PayMode = "wallet" | "turnkey";

interface Settled {
  txHash: string;
  amount: string;
  fee: string;
  net: string;
  merchant: string;
}

function randHex(bytes: number): Hex {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a);
}

export default function PayPage() {
  const { available, provider } = useWallet();
  const chain = getCeloChain(CHAIN_ID);
  const { facilitator, identityRegistry } = getEnvoyAddresses(CHAIN_ID);
  const token = chain.assets.cUSD.address;
  const decimals = chain.assets.cUSD.decimals;

  const [agentId, setAgentId] = useState("128");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("0.001");

  const [mode, setMode] = useState<PayMode>("wallet");
  const [turnkeyAvailable, setTurnkeyAvailable] = useState<boolean | null>(null);

  const [steps, setSteps] = useState<Step[]>(STEPS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/turnkey/status")
      .then((r) => r.json())
      .then((d) => live && setTurnkeyAvailable(Boolean(d?.configured)))
      .catch(() => live && setTurnkeyAvailable(false));
    return () => {
      live = false;
    };
  }, []);

  function patch(key: string, state: StepState, note?: string) {
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, state, note } : x)));
  }

  async function run() {
    setError(null);
    setSettled(null);
    setSteps(STEPS.map((s) => ({ ...s, state: "idle", note: undefined })));
    setRunning(true);

    try {
      if (!/^\d+$/.test(agentId.trim())) throw new Error("Enter a numeric agent id.");
      const id = BigInt(agentId.trim());
      const merchantAddr = merchant.trim() as Address;
      if (!/^0x[a-fA-F0-9]{40}$/.test(merchantAddr)) throw new Error("Enter a valid merchant address.");
      if (!/^\d*\.?\d+$/.test(amount.trim())) throw new Error("Enter a valid cUSD amount.");
      const value = parseUnits(amount.trim(), decimals);
      if (value <= 0n) throw new Error("Amount must be greater than zero.");

      // 1 — connect + verify the signer is the agent's authorized wallet
      patch("connect", "active");
      const { account, walletClient, publicClient } = await connectWallet(CHAIN_ID, provider ?? undefined);
      const agentWallet = (await publicClient.readContract({
        address: identityRegistry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "getAgentWallet",
        args: [id],
      })) as Address;
      if (agentWallet === "0x0000000000000000000000000000000000000000") {
        throw new Error(`Agent #${agentId} has no signing wallet set.`);
      }
      if (agentWallet.toLowerCase() !== account.toLowerCase()) {
        throw new Error(
          `Connected wallet ${account.slice(0, 8)}… is not agent #${agentId}'s signing wallet (${agentWallet.slice(0, 8)}…). Connect the agent's wallet.`,
        );
      }
      patch("connect", "done", `${account.slice(0, 6)}…${account.slice(-4)} = agent #${agentId}`);

      // 2 — ensure a spending limit covers this payment
      patch("limit", "active");
      const limit = (await publicClient.readContract({
        address: facilitator,
        abi: ENVOY_FACILITATOR_ABI,
        functionName: "getLimit",
        args: [id, token],
      })) as {
        perTx: bigint;
        perPeriod: bigint;
        spentInPeriod: bigint;
        periodStart: bigint;
        periodLen: number;
        enabled: boolean;
      };
      // Account for what's already been spent in the current (un-rolled) window —
      // otherwise we'd skip and let pay() revert PerPeriodExceeded at settle time.
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const windowActive = nowSec < limit.periodStart + BigInt(limit.periodLen);
      const spent = windowActive ? limit.spentInPeriod : 0n;
      const remaining = limit.perPeriod - spent;
      if (limit.enabled && limit.perTx >= value && remaining >= value) {
        patch("limit", "skip", "already set");
      } else {
        const authorized = (await publicClient.readContract({
          address: identityRegistry,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "isAuthorizedOrOwner",
          args: [account, id],
        })) as boolean;
        if (!authorized) throw new Error("Connected wallet can't set policy — must be the agent owner.");
        const perPeriod = value * 100n;
        const tx = await walletClient.writeContract({
          account,
          chain: walletClient.chain,
          address: facilitator,
          abi: ENVOY_FACILITATOR_ABI,
          functionName: "setLimit",
          args: [id, token, value, perPeriod, PERIOD],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        patch("limit", "done", "policy set");
      }

      // 3 — ensure the facilitator can pull cUSD from the agent wallet
      patch("approve", "active");
      const allowance = (await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, facilitator],
      })) as bigint;
      if (allowance >= value) {
        patch("approve", "skip", "sufficient allowance");
      } else {
        const tx = await walletClient.writeContract({
          account,
          chain: walletClient.chain,
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [facilitator, value],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });
        patch("approve", "done", "approved");
      }

      // 4 — sign the typed payment authorization
      patch("sign", "active");
      const auth: PaymentAuth = {
        agentId: id,
        token,
        merchant: merchantAddr,
        amount: value,
        challengeId: randHex(32),
        nonce: BigInt(randHex(32)),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };
      const signature = await walletClient.signTypedData({
        account,
        ...paymentAuthTypedData({ chainId: CHAIN_ID, facilitator, auth }),
      });
      patch("sign", "done", "authorized");

      // 5 — settle on-chain
      patch("settle", "active");
      const tx = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: facilitator,
        abi: ENVOY_FACILITATOR_ABI,
        functionName: "pay",
        args: [auth, signature],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

      let fee = 0n;
      let amt = value;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== facilitator.toLowerCase()) continue;
        try {
          const d = decodeEventLog({ abi: ENVOY_FACILITATOR_ABI, data: log.data, topics: log.topics });
          if (d.eventName === "Settled") {
            const a = d.args as { amount: bigint; fee: bigint };
            amt = a.amount;
            fee = a.fee;
          }
        } catch {
          /* not Settled */
        }
      }
      patch("settle", "done", "Settled ✓");
      setSettled({
        txHash: tx,
        amount: formatUnits(amt, decimals),
        fee: formatUnits(fee, decimals),
        net: formatUnits(amt - fee, decimals),
        merchant: merchantAddr,
      });
    } catch (err: unknown) {
      const msg =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as Error)?.message ??
        "Payment failed.";
      setError(msg);
      setSteps((s) => s.map((x) => (x.state === "active" ? { ...x, state: "error" } : x)));
    } finally {
      setRunning(false);
    }
  }

  // Full enclave autonomy: no browser wallet. The agent's Turnkey key signs the
  // PaymentAuth and submits pay() itself (paying its own gas) via the server routes.
  async function runTurnkey() {
    setError(null);
    setSettled(null);
    setSteps(STEPS_TK.map((s) => ({ ...s, state: "idle", note: undefined })));
    setRunning(true);

    try {
      if (!/^\d+$/.test(agentId.trim())) throw new Error("Enter a numeric agent id.");
      const id = agentId.trim();
      const merchantAddr = merchant.trim() as Address;
      if (!/^0x[a-fA-F0-9]{40}$/.test(merchantAddr)) throw new Error("Enter a valid merchant address.");
      if (!/^\d*\.?\d+$/.test(amount.trim())) throw new Error("Enter a valid cUSD amount.");
      const value = parseUnits(amount.trim(), decimals);
      if (value <= 0n) throw new Error("Amount must be greater than zero.");

      // 1 — resolve the agent's enclave wallet (live, no key needed)
      patch("resolve", "active");
      const agentWallet = (await READ_CLIENT.readContract({
        address: identityRegistry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "getAgentWallet",
        args: [BigInt(id)],
      })) as Address;
      if (agentWallet === ZERO_ADDR) throw new Error(`Agent #${id} has no signing wallet set.`);
      patch("resolve", "done", `${agentWallet.slice(0, 6)}…${agentWallet.slice(-4)}`);

      // 2 — check the on-chain spending policy covers this payment
      patch("limit", "active");
      const limit = (await READ_CLIENT.readContract({
        address: facilitator,
        abi: ENVOY_FACILITATOR_ABI,
        functionName: "getLimit",
        args: [BigInt(id), token],
      })) as {
        perTx: bigint;
        perPeriod: bigint;
        spentInPeriod: bigint;
        periodStart: bigint;
        periodLen: number;
        enabled: boolean;
      };
      if (!limit.enabled) {
        throw new Error("No spending policy set for this agent — the owner sets one at /create.");
      }
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const windowActive = nowSec < limit.periodStart + BigInt(limit.periodLen);
      const remaining = limit.perPeriod - (windowActive ? limit.spentInPeriod : 0n);
      if (limit.perTx < value) {
        throw new Error(`Per-tx limit is ${formatUnits(limit.perTx, decimals)} cUSD — lower the amount.`);
      }
      if (remaining < value) {
        throw new Error(`Daily cap reached — ${formatUnits(remaining, decimals)} cUSD left in this window.`);
      }
      patch("limit", "done", `≤ ${formatUnits(limit.perTx, decimals)} / tx · enforced on-chain`);

      // 3 — the enclave approves cUSD for the facilitator (if needed)
      patch("approve", "active");
      const ar = await fetch("/api/turnkey/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId: CHAIN_ID, agentId: id, amount: amount.trim() }),
      });
      const ad = await ar.json();
      if (!ar.ok) throw new Error(ad?.error ?? "Approve failed.");
      patch(
        "approve",
        ad.status === "sufficient" ? "skip" : "done",
        ad.status === "sufficient" ? "allowance already set" : "approved (enclave-signed)",
      );

      // 4 — the enclave signs the PaymentAuth and submits pay()
      patch("settle", "active");
      const pr = await fetch("/api/turnkey/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId: CHAIN_ID, agentId: id, merchant: merchantAddr, amount: amount.trim() }),
      });
      const pd = await pr.json();
      if (!pr.ok) throw new Error(pd?.error ?? "Settle failed.");
      patch("settle", "done", "Settled ✓");
      setSettled({
        txHash: pd.txHash,
        amount: pd.amount,
        fee: pd.fee,
        net: pd.net,
        merchant: merchantAddr,
      });
    } catch (err: unknown) {
      const msg =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as Error)?.message ??
        "Payment failed.";
      setError(msg);
      setSteps((s) => s.map((x) => (x.state === "active" ? { ...x, state: "error" } : x)));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[680px] px-6 pb-28 pt-16">
        <span className="small-caps text-ink-mute">pay out · x402 / mpp</span>
        <h1 className="mt-4 font-display text-[clamp(34px,5vw,54px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink">
          Watch me pay a merchant.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
          A service answered <span className="font-mono text-ink">402</span>. My wallet
          signs an EIP-712 authorization, and the immutable{" "}
          <span className="font-medium text-ink">EnvoyFacilitator</span> settles it on
          Celo — net to the merchant, fee to the treasury, in one atomic transaction.
        </p>
        <p className="mt-3 font-mono text-[12px] text-ink-faint">
          {mode === "turnkey"
            ? `agent #${agentId} signs in its Turnkey enclave — no wallet to connect · needs cUSD + a little CELO for gas · Celo Mainnet`
            : `connect agent #${agentId}'s signing wallet · needs cUSD + a little CELO for gas · Celo Mainnet`}
        </p>

        {/* the simulated challenge */}
        <div className="glass mt-9 rounded-[24px] p-6 md:p-7">
          <p className="small-caps text-ink-faint">who signs</p>
          <div className="mt-2.5 flex gap-2">
            <ModeBtn active={mode === "wallet"} onClick={() => setMode("wallet")}>
              Connected wallet
            </ModeBtn>
            <ModeBtn
              active={mode === "turnkey"}
              disabled={!turnkeyAvailable}
              onClick={() => setMode("turnkey")}
            >
              Turnkey agent <span className="text-ink-faint">enclave</span>
            </ModeBtn>
          </div>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">
            {turnkeyAvailable === false
              ? "turnkey not configured on this server — set TURNKEY_* in web/.env.local to enable enclave mode"
              : mode === "turnkey"
                ? "the agent's enclave key signs + submits everything — no human wallet in the loop"
                : "connect the agent's signing wallet (self-custody) to sign + settle"}
          </p>

          <p className="mt-5 small-caps text-ink-faint">payment challenge</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="agent id">
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="field"
              />
            </Field>
            <Field label="amount (cUSD)">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
            </Field>
            <Field label="merchant">
              <input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="0x…"
                className="field"
              />
            </Field>
          </div>

          <button
            onClick={mode === "turnkey" ? runTurnkey : run}
            disabled={running || (mode === "wallet" ? !available : !turnkeyAvailable)}
            className="pill-dark mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-slate-text disabled:opacity-60"
          >
            {running ? "Settling…" : mode === "turnkey" ? "Pay from enclave" : "Sign & pay"}
            {!running && <span className="font-mono text-xs">↗</span>}
          </button>

          {mode === "wallet" && !available && (
            <p className="mt-3 text-center font-mono text-[11px] text-ink-faint">
              No browser wallet detected — install MetaMask or Valora.
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
              {error}
            </p>
          )}
        </div>

        {/* step tracker */}
        <ol className="mt-5 flex flex-col gap-2.5">
          {steps.map((s, i) => (
            <li key={s.key} className="glass flex items-center gap-4 rounded-2xl px-5 py-4">
              <StepDot state={s.state} n={i + 1} />
              <div className="flex-1">
                <p className={`text-[15px] font-medium ${s.state === "idle" ? "text-ink-faint" : "text-ink"}`}>
                  {s.label}
                </p>
                {s.note && <p className="mt-0.5 font-mono text-[11px] text-ink-mute">{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>

        {settled && (
          <div className="glass-hot mt-5 rounded-[24px] p-6 md:p-7">
            <p className="flag text-ink">settled on celo ✓</p>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Stat k="amount" v={`${settled.amount} cUSD`} />
              <Stat k="to merchant" v={`${settled.net} cUSD`} />
              <Stat k="treasury fee" v={`${settled.fee} cUSD`} />
            </div>
            <a
              href={`${chain.explorer}/tx/${settled.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="pill mt-5 inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium text-ink"
            >
              View Settled tx on Celoscan ↗
            </a>
          </div>
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-ink-faint">
          facilitator · {facilitator} · Celo Mainnet
        </p>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="small-caps text-ink-faint">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ModeBtn({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "pill-dark text-slate-text"
          : "border border-ink/10 bg-paper-bright/50 text-ink-soft hover:border-ink/20"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="flag text-ink-faint">{k}</p>
      <p className="mt-1 font-mono text-sm text-ink">{v}</p>
    </div>
  );
}

function StepDot({ state, n }: { state: StepState; n: number }) {
  if (state === "done" || state === "skip") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] text-paper-bright">
        ✓
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/30 text-[12px] text-ink">
        ✕
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
        <span className="absolute h-7 w-7 animate-ping rounded-full bg-ink/20" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-ink" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/15 font-mono text-[12px] text-ink-faint">
      {n}
    </span>
  );
}
