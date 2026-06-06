"use client";

import { Fragment, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  formatUnits,
  http,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

// Self-custody: sign with the agent's own key, pasted + held client-side (never
// sent to a server). Same on-chain steps as wallet mode — the signer is the agent.
const STEPS_AK: Step[] = [
  { key: "connect", label: "Verify agent signing key", state: "idle" },
  { key: "limit", label: "Spending policy on-chain", state: "idle" },
  { key: "approve", label: "Approve cUSD allowance", state: "idle" },
  { key: "sign", label: "Sign EIP-712 payment authorization", state: "idle" },
  { key: "settle", label: "EnvoyFacilitator.pay() settles", state: "idle" },
];

type PayMode = "wallet" | "turnkey" | "agentkey";

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
  const { available, provider, account } = useWallet();
  const chain = getCeloChain(CHAIN_ID);
  const { facilitator, identityRegistry } = getEnvoyAddresses(CHAIN_ID);
  const token = chain.assets.cUSD.address;
  const decimals = chain.assets.cUSD.decimals;

  const [agentId, setAgentId] = useState("128");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("0.001");

  const [mode, setMode] = useState<PayMode>("agentkey");
  const [turnkeyAvailable, setTurnkeyAvailable] = useState<boolean | null>(null);
  const [agentKey, setAgentKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // The connected wallet's own agents — populates the agent-id picker.
  const [agents, setAgents] = useState<{ agentId: string; agentWallet: string; walletTail: string }[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

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

  // Load the agents this wallet owns whenever the connected account changes.
  useEffect(() => {
    if (!account) {
      setAgents([]);
      return;
    }
    let live = true;
    setAgentsLoading(true);
    fetch(`/api/agents?owner=${account}&chain=${CHAIN_ID}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const list = Array.isArray(d?.agents) ? d.agents : [];
        setAgents(list);
        // Pre-select the wallet's newest agent unless the current id is already theirs.
        if (list.length) {
          setAgentId((cur) => (list.some((a: { agentId: string }) => a.agentId === cur) ? cur : list[0].agentId));
        }
      })
      .catch(() => live && setAgents([]))
      .finally(() => live && setAgentsLoading(false));
    return () => {
      live = false;
    };
  }, [account]);

  function patch(key: string, state: StepState, note?: string) {
    setSteps((s) => s.map((x) => (x.key === key ? { ...x, state, note } : x)));
  }

  // Switch signer mode and reset the tracker to that mode's step list.
  function chooseMode(m: PayMode) {
    setMode(m);
    setError(null);
    setSettled(null);
    const base = m === "turnkey" ? STEPS_TK : m === "agentkey" ? STEPS_AK : STEPS;
    setSteps(base.map((s) => ({ ...s, state: "idle", note: undefined })));
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

  // Self-custody autonomy: the agent signs with its OWN key, pasted and held only
  // in this browser tab (never sent anywhere). Mirrors the CLI demo's AGENT_PRIVATE_KEY:
  // same on-chain steps as wallet mode, but the signer is the agent itself.
  async function runAgentKey() {
    setError(null);
    setSettled(null);
    setSteps(STEPS_AK.map((s) => ({ ...s, state: "idle", note: undefined })));
    setRunning(true);

    try {
      if (!/^\d+$/.test(agentId.trim())) throw new Error("Enter a numeric agent id.");
      const id = BigInt(agentId.trim());
      const merchantAddr = merchant.trim() as Address;
      if (!/^0x[a-fA-F0-9]{40}$/.test(merchantAddr)) throw new Error("Enter a valid merchant address.");
      if (!/^\d*\.?\d+$/.test(amount.trim())) throw new Error("Enter a valid cUSD amount.");
      const value = parseUnits(amount.trim(), decimals);
      if (value <= 0n) throw new Error("Amount must be greater than zero.");

      // normalize + validate the agent's signing key (stays client-side only)
      let hex = agentKey.trim();
      if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
      if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error("Enter the agent's 64-character hex private key (the one shown once at /create).");
      }
      const account = privateKeyToAccount(`0x${hex}` as Hex);
      const walletClient = createWalletClient({ account, chain: celo, transport: http(chain.rpcUrl) });

      // 1 — verify this key IS the agent's authorized signing wallet (fail fast)
      patch("connect", "active");
      const agentWallet = (await READ_CLIENT.readContract({
        address: identityRegistry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "getAgentWallet",
        args: [id],
      })) as Address;
      if (agentWallet === ZERO_ADDR) throw new Error(`Agent #${agentId} has no signing wallet set.`);
      if (agentWallet.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(
          `This key is ${account.address.slice(0, 8)}… — not agent #${agentId}'s signing wallet (${agentWallet.slice(0, 8)}…). Paste the key shown when you created the agent.`,
        );
      }
      patch("connect", "done", `${account.address.slice(0, 6)}…${account.address.slice(-4)} = agent #${agentId}`);

      // 2 — ensure a spending limit covers this payment
      patch("limit", "active");
      const limit = (await READ_CLIENT.readContract({
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
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const windowActive = nowSec < limit.periodStart + BigInt(limit.periodLen);
      const remaining = limit.perPeriod - (windowActive ? limit.spentInPeriod : 0n);
      if (limit.enabled && limit.perTx >= value && remaining >= value) {
        patch("limit", "skip", "already set");
      } else {
        // Only the owner can set policy — the agent's signing key usually isn't the owner.
        const authorized = (await READ_CLIENT.readContract({
          address: identityRegistry,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "isAuthorizedOrOwner",
          args: [account.address, id],
        })) as boolean;
        if (!authorized) {
          throw new Error(
            "No (or too low) spending policy, and this agent key isn't the owner. Set the policy from the owner wallet at /create, then retry.",
          );
        }
        const tx = await walletClient.writeContract({
          account,
          chain: celo,
          address: facilitator,
          abi: ENVOY_FACILITATOR_ABI,
          functionName: "setLimit",
          args: [id, token, value, value * 100n, PERIOD],
        });
        await READ_CLIENT.waitForTransactionReceipt({ hash: tx });
        patch("limit", "done", "policy set");
      }

      // 3 — ensure the facilitator can pull cUSD from the agent wallet
      patch("approve", "active");
      const allowance = (await READ_CLIENT.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, facilitator],
      })) as bigint;
      if (allowance >= value) {
        patch("approve", "skip", "sufficient allowance");
      } else {
        const tx = await walletClient.writeContract({
          account,
          chain: celo,
          address: token,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [facilitator, value],
        });
        await READ_CLIENT.waitForTransactionReceipt({ hash: tx });
        patch("approve", "done", "approved");
      }

      // 4 — the agent signs the typed payment authorization with its own key
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

      // 5 — settle on-chain (the agent pays its own gas)
      patch("settle", "active");
      const tx = await walletClient.writeContract({
        account,
        chain: celo,
        address: facilitator,
        abi: ENVOY_FACILITATOR_ABI,
        functionName: "pay",
        args: [auth, signature],
      });
      const receipt = await READ_CLIENT.waitForTransactionReceipt({ hash: tx });

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

  const activeStep = steps.find((s) => s.state === "active");
  const lastNote = [...steps].reverse().find((s) => s.note)?.note;
  const statusLine = activeStep ? activeStep.label : lastNote;

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[620px] px-6 pb-28 pt-16">
        <span className="small-caps text-ink-mute">pay out · x402 / mpp</span>
        <h1 className="mt-3 font-display text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
          Pay a merchant.
        </h1>
        <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-ink-soft">
          The agent signs an EIP-712 authorization; the immutable{" "}
          <span className="font-medium text-ink">EnvoyFacilitator</span> settles it on Celo —
          net to the merchant, fee to the treasury, in one transaction.
        </p>

        {/* control panel */}
        <div className="glass mt-7 rounded-[22px] p-5 md:p-6">
          {/* who signs + chain */}
          <div className="flex items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={chooseMode}
              options={[
                { value: "agentkey", label: "Agent key" },
                { value: "wallet", label: "Wallet" },
                { value: "turnkey", label: "Enclave", disabled: !turnkeyAvailable },
              ]}
            />
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 font-mono text-[10px] text-ink-faint sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-silver" />
              Celo · cUSD
            </span>
          </div>

          {mode === "agentkey" && (
            <div className="relative mt-4">
              <input
                type={showKey ? "text" : "password"}
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value)}
                placeholder="agent signing key · 0x…"
                autoComplete="off"
                spellCheck={false}
                className="field pr-14 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 small-caps text-ink-faint transition-colors hover:text-ink"
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_0.6fr]">
            <Field label="agent">
              <input
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="agent id — type it, or pick a suggestion"
                inputMode="numeric"
                list={account && agents.length > 0 ? "my-agents" : undefined}
                className="field"
              />
              {account && agents.length > 0 && (
                <datalist id="my-agents">
                  {agents.map((a) => {
                    const selfSigned =
                      !!account && a.agentWallet.toLowerCase() === account.toLowerCase();
                    return (
                      <option key={a.agentId} value={a.agentId}>
                        {selfSigned ? "you sign" : `agent key 0x…${a.walletTail}`}
                      </option>
                    );
                  })}
                </datalist>
              )}
            </Field>
            <Field label="amount">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="merchant">
              <input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="0x…"
                className="field font-mono"
              />
            </Field>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-ink-faint">
            {account && agentsLoading && <span>finding your agents…</span>}
            {account && !agentsLoading && agents.length > 0 && (
              <span>type any id, or pick from the {agents.length} on this wallet</span>
            )}
            {account && !agentsLoading && agents.length === 0 && <span>type your agent id</span>}
            {!account && <span>connect a wallet to list your agents</span>}
            {mode === "agentkey" && <span>· key stays in your browser</span>}
          </div>

          <button
            onClick={mode === "turnkey" ? runTurnkey : mode === "agentkey" ? runAgentKey : run}
            disabled={
              running ||
              (mode === "wallet"
                ? !available
                : mode === "turnkey"
                  ? !turnkeyAvailable
                  : !agentKey.trim())
            }
            className="pill-dark mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-slate-text disabled:opacity-60"
          >
            {running ? "Settling…" : "Sign & pay"}
            {!running && <span className="font-mono text-xs">↗</span>}
          </button>

          {mode === "wallet" && !available && (
            <p className="mt-2.5 text-center font-mono text-[11px] text-ink-faint">
              No browser wallet — install MetaMask or Valora.
            </p>
          )}
          {mode === "turnkey" && turnkeyAvailable === false && (
            <p className="mt-2.5 text-center font-mono text-[11px] text-ink-faint">
              Enclave off — set TURNKEY_* in web/.env.local.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
            {error}
          </p>
        )}

        {/* automated pipeline — a slim progress strip, not a manual checklist */}
        <div className="glass mt-4 rounded-2xl px-5 py-4">
          <div className="flex items-center">
            {steps.map((s, i) => (
              <Fragment key={s.key}>
                <StepDot state={s.state} n={i + 1} />
                {i < steps.length - 1 && (
                  <div
                    className={`mx-2 h-px flex-1 transition-colors ${
                      s.state === "done" || s.state === "skip" ? "bg-ink/30" : "bg-ink/[0.12]"
                    }`}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <p className="mt-3 text-center font-mono text-[11px] text-ink-mute">
            {running && <span className="mr-1.5 inline-block animate-pulse">●</span>}
            {statusLine ?? "ready to settle"}
          </p>
        </div>

        {settled && (
          <div className="glass-hot mt-4 rounded-[22px] p-5 md:p-6">
            <p className="flag text-ink">settled on celo ✓</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat k="amount" v={`${settled.amount} cUSD`} />
              <Stat k="to merchant" v={`${settled.net} cUSD`} />
              <Stat k="fee" v={`${settled.fee} cUSD`} />
            </div>
            <a
              href={`${chain.explorer}/tx/${settled.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="pill mt-4 inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium text-ink"
            >
              View on Celoscan ↗
            </a>
          </div>
        )}

        <p className="mt-6 text-center font-mono text-[10px] text-ink-faint">
          facilitator {facilitator.slice(0, 10)}…{facilitator.slice(-6)} · Celo Mainnet
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

function Segmented({
  value,
  onChange,
  options,
}: {
  value: PayMode;
  onChange: (v: PayMode) => void;
  options: { value: PayMode; label: string; disabled?: boolean }[];
}) {
  return (
    <div className="inline-flex rounded-full border border-ink/10 bg-paper-bright/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value === o.value ? "pill-dark text-slate-text" : "text-ink-soft hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-paper-bright">
        ✓
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/40 text-[11px] text-ink">
        ✕
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <span className="absolute h-6 w-6 animate-ping rounded-full bg-ink/20" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-ink" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/15 font-mono text-[11px] text-ink-faint">
      {n}
    </span>
  );
}
