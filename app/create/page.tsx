"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { decodeEventLog, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Masthead } from "@/app/_components/Masthead";
import { useWallet } from "@/app/_components/WalletProvider";
import { connectWallet } from "@/lib/wallet";
import { getEnvoyAddresses } from "@/lib/contracts";
import {
  ERC8004_IDENTITY_ABI,
  ENVOY_FACILITATOR_ABI,
  agentWalletSetTypedData,
} from "@/lib/abi";
import { CELO_MAINNET, getCeloChain } from "@/lib/chains";
import {
  dataUriSize,
  encodeDataURI,
  type AgentCardData,
} from "@/lib/agentCard";
import { SelfVerify } from "./SelfVerify";

const SEMVER = /^\d+\.\d+\.\d+/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const PERIOD = 86_400; // 1-day spending window for the policy

// Quick-add suggestions for the capabilities field. `x402-payments` is the gate
// a merchant checks before serving a paid request; the rest are descriptive tags.
const SUGGESTED_CAPS = [
  "x402-payments",
  "research",
  "summarization",
  "web-search",
  "data-analysis",
  "code-generation",
  "translation",
  "monitoring",
  "mcp",
];

type StepState = "idle" | "active" | "done" | "skip" | "error";
interface Step {
  key: string;
  label: string;
  state: StepState;
  note?: string;
}

type Custody = "self" | "turnkey";

interface Result {
  agentId: string;
  agentAddress: Address;
  owner: Address;
  registerTx: string;
  bindTx: string;
  policyTx: string | null;
  chainId: number;
  custody: Custody;
  turnkeyWalletId?: string;
}

interface GeneratedKey {
  privateKey: Hex;
  address: Address;
}

export default function CreatePage() {
  // Mainnet-only — the EnvoyFacilitator is deployed on Celo Mainnet.
  const chainId = CELO_MAINNET;
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [capabilities, setCapabilities] = useState("");
  const [description, setDescription] = useState("");
  const [a2a, setA2a] = useState("");
  const [payment, setPayment] = useState("");
  // Autonomous spending policy (Celo Mainnet only — facilitator lives there).
  const [perTx, setPerTx] = useState("1");
  const [dailyCap, setDailyCap] = useState("25");

  const [steps, setSteps] = useState<Step[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // The agent's private key (self-custody only). Held in component memory —
  // never persisted, logged, or sent anywhere. Revealed once for the operator.
  const [key, setKey] = useState<GeneratedKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [savedAck, setSavedAck] = useState(false);

  // Where the agent's key lives. Turnkey is offered only when the server has
  // credentials configured (probed once on mount); otherwise we stay self-custody.
  const [custody, setCustody] = useState<Custody>("self");
  const [turnkeyAvailable, setTurnkeyAvailable] = useState<boolean | null>(null);

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

  const { available, provider } = useWallet();
  const chain = getCeloChain(chainId);
  const isMainnet = chainId === CELO_MAINNET;

  const caps = useMemo(
    () =>
      capabilities
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    [capabilities],
  );

  // Tap a suggestion chip to add/remove it from the comma-separated field.
  function toggleCap(cap: string) {
    const next = caps.includes(cap) ? caps.filter((c) => c !== cap) : [...caps, cap];
    setCapabilities(next.join(", "));
  }

  // Card as it will be stored (owner = your wallet, payment address = the agent's
  // generated signing wallet). Zero placeholders keep the byte estimate honest.
  const previewCard: AgentCardData = useMemo(() => {
    const endpoints: NonNullable<AgentCardData["endpoints"]> = {};
    if (a2a.trim()) endpoints.a2a = a2a.trim();
    if (payment.trim()) endpoints.payment = payment.trim();
    return {
      name: name.trim() || "Unnamed agent",
      version: version.trim() || "0.0.0",
      ...(description.trim() ? { description: description.trim() } : {}),
      capabilities: caps,
      owner: ZERO_ADDR,
      ...(Object.keys(endpoints).length ? { endpoints } : {}),
      addresses: [
        { chain: chain.shortName, caip2Id: `eip155:${chainId}`, address: ZERO_ADDR },
      ],
    };
  }, [name, version, description, caps, a2a, payment, chain.shortName, chainId]);

  const onChainBytes = useMemo(() => dataUriSize(previewCard), [previewCard]);

  function buildSteps(mainnet: boolean, mode: Custody): Step[] {
    const tk = mode === "turnkey";
    const base: Step[] = [
      { key: "connect", label: "Connect owner wallet", state: "idle" },
      {
        key: "generate",
        label: tk ? "Provision signing key in Turnkey (TEE)" : "Generate the agent's signing key",
        state: "idle",
      },
      { key: "register", label: "Register identity on Celo (mint)", state: "idle" },
      {
        key: "authorize",
        label: tk ? "Turnkey signs wallet binding (TEE · EIP-712)" : "Agent signs wallet binding (EIP-712)",
        state: "idle",
      },
      { key: "bind", label: "Bind signing wallet on-chain", state: "idle" },
    ];
    if (mainnet) {
      base.push({ key: "policy", label: "Set autonomous spending policy", state: "idle" });
    }
    return base;
  }

  function patch(k: string, state: StepState, note?: string) {
    setSteps((s) => (s ? s.map((x) => (x.key === k ? { ...x, state, note } : x)) : s));
  }

  async function create() {
    setError(null);
    setResult(null);
    setKey(null);
    setRevealed(false);
    setSavedAck(false);

    // Form-level checks before we prompt the wallet.
    if (!name.trim()) return setError("Give your agent a name.");
    if (!SEMVER.test(version.trim())) return setError('Version must be semver, e.g. "1.0.0".');
    if (caps.length === 0) return setError("Add at least one capability.");
    if (custody === "turnkey" && !turnkeyAvailable) {
      return setError("Turnkey isn't configured on this server — switch to self-custody.");
    }

    const token = chain.assets.cUSD.address;
    const decimals = chain.assets.cUSD.decimals;
    let perTxValue = 0n;
    let perPeriodValue = 0n;
    if (isMainnet) {
      if (!/^\d*\.?\d+$/.test(perTx.trim()) || !/^\d*\.?\d+$/.test(dailyCap.trim())) {
        return setError("Spending limits must be valid cUSD amounts.");
      }
      perTxValue = parseUnits(perTx.trim(), decimals);
      perPeriodValue = parseUnits(dailyCap.trim(), decimals);
      if (perTxValue <= 0n || perPeriodValue <= 0n) {
        return setError("Spending limits must be greater than zero.");
      }
      if (perTxValue > perPeriodValue) {
        return setError("Per-transaction limit can't exceed the daily cap.");
      }
    }

    setSteps(buildSteps(isMainnet, custody));
    setRunning(true);

    try {
      // 1 — connect the owner wallet (the EOA that will hold the NFT)
      patch("connect", "active");
      const { account, walletClient, publicClient } = await connectWallet(chainId, provider ?? undefined);
      const { identityRegistry, facilitator } = getEnvoyAddresses(chainId);
      patch("connect", "done", `${account.slice(0, 6)}…${account.slice(-4)}`);

      // 2 — obtain the agent's signing key.
      //   self-custody: generated in-browser (secure RNG), revealed once.
      //   turnkey:      provisioned in the enclave, non-exportable, signs via API.
      patch("generate", "active");
      let agentAddress: Address;
      let turnkeyWalletId: string | undefined;
      let signAgentWalletSet: (id: bigint, deadline: bigint) => Promise<Hex>;
      if (custody === "turnkey") {
        const res = await fetch("/api/turnkey/provision", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: name.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Turnkey provisioning failed.");
        agentAddress = data.address as Address;
        turnkeyWalletId = data.walletId as string;
        signAgentWalletSet = async (id, dl) => {
          const r = await fetch("/api/turnkey/sign", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chainId,
              agentId: id.toString(),
              newWallet: agentAddress,
              owner: account,
              deadline: dl.toString(),
            }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d?.error ?? "Turnkey signing failed.");
          return d.signature as Hex;
        };
        patch("generate", "done", `Turnkey · ${agentAddress.slice(0, 6)}…${agentAddress.slice(-4)}`);
      } else {
        const privateKey = generatePrivateKey();
        const agentAccount = privateKeyToAccount(privateKey);
        agentAddress = agentAccount.address;
        setKey({ privateKey, address: agentAddress });
        signAgentWalletSet = (id, dl) =>
          agentAccount.signTypedData(
            agentWalletSetTypedData({
              chainId,
              registry: identityRegistry,
              agentId: id,
              newWallet: agentAddress,
              owner: account,
              deadline: dl,
            }),
          );
        patch("generate", "done", `${agentAddress.slice(0, 6)}…${agentAddress.slice(-4)}`);
      }

      // 3 — mint the ERC-8004 identity; bake the agent wallet into the card so the
      //     on-chain card is honest about who receives + spends funds.
      patch("register", "active");
      const endpoints: NonNullable<AgentCardData["endpoints"]> = {};
      if (a2a.trim()) endpoints.a2a = a2a.trim();
      if (payment.trim()) endpoints.payment = payment.trim();
      const card: AgentCardData = {
        name: name.trim(),
        version: version.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        capabilities: caps,
        owner: account,
        ...(Object.keys(endpoints).length ? { endpoints } : {}),
        addresses: [
          { chain: chain.shortName, caip2Id: `eip155:${chainId}`, address: agentAddress },
        ],
      };
      const tokenUri = encodeDataURI(card); // validates; throws on an invalid card

      const registerTx = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: identityRegistry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "register",
        args: [tokenUri],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: registerTx });
      let agentId: bigint | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== identityRegistry.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: ERC8004_IDENTITY_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "Registered") {
            agentId = (decoded.args as { agentId: bigint }).agentId;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (agentId === null) {
        throw new Error("Registered, but couldn't parse the agentId from the receipt.");
      }
      patch("register", "done", `agent #${agentId.toString()}`);

      // 4 — the agent key signs AgentWalletSet, proving control of its own key.
      patch("authorize", "active");
      // The canonical registry rejects a binding deadline set too far ahead
      // ("deadline too far" — it enforces a short replay window, well under an
      // hour). Anchor to chain time (not the client clock, which may be skewed)
      // and leave ~150s — comfortably inside the window, ample for the prompt.
      const nowBlock = await publicClient.getBlock();
      const deadline = nowBlock.timestamp + 150n;
      const signature = await signAgentWalletSet(agentId, deadline);
      patch("authorize", "done", custody === "turnkey" ? "signed in enclave" : "agent authorized its key");

      // 5 — owner binds the signing wallet on-chain (rotates agentWallet to it).
      patch("bind", "active");
      const bindTx = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: identityRegistry,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "setAgentWallet",
        args: [agentId, agentAddress, deadline, signature],
      });
      await publicClient.waitForTransactionReceipt({ hash: bindTx });
      patch("bind", "done", "agentWallet → agent key");

      // 6 — owner sets the autonomous spending policy (Mainnet only).
      let policyTx: Hex | null = null;
      if (isMainnet) {
        patch("policy", "active");
        policyTx = await walletClient.writeContract({
          account,
          chain: walletClient.chain,
          address: facilitator,
          abi: ENVOY_FACILITATOR_ABI,
          functionName: "setLimit",
          args: [agentId, token, perTxValue, perPeriodValue, PERIOD],
        });
        await publicClient.waitForTransactionReceipt({ hash: policyTx });
        patch("policy", "done", `${perTx} / tx · ${dailyCap} / day`);
      }

      setResult({
        agentId: agentId.toString(),
        agentAddress,
        owner: account,
        registerTx,
        bindTx,
        policyTx,
        chainId,
        custody,
        turnkeyWalletId,
      });
    } catch (err: unknown) {
      const msg =
        (err as { shortMessage?: string })?.shortMessage ??
        (err as Error)?.message ??
        "Create failed.";
      setError(msg);
      setSteps((s) => (s ? s.map((x) => (x.state === "active" ? { ...x, state: "error" } : x)) : s));
    } finally {
      setRunning(false);
    }
  }

  const activeStep = steps?.find((s) => s.state === "active");
  const lastNote = steps ? [...steps].reverse().find((s) => s.note)?.note : undefined;
  const createStatus = activeStep ? activeStep.label : lastNote;

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[940px] px-6 pb-28 pt-16">
        <span className="small-caps text-ink-mute">mint · erc-8004 · autonomous</span>
        <h1 className="mt-3 font-display text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
          Give your agent an account.
        </h1>
        <p className="mt-3 max-w-[40rem] text-[15px] leading-relaxed text-ink-soft">
          Register an ERC-8004 identity on Celo. You keep the NFT and set the limits; the
          agent gets <span className="font-medium text-ink">its own signing key</span> and
          pays within them — no wallet pop-ups at run time.
        </p>

        {/* builder — inputs left, live preview + action right */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_330px] lg:items-start">
          <div className="glass rounded-[22px] p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="small-caps text-ink-faint">key custody</p>
                <div className="mt-2">
                  <Segmented
                    value={custody}
                    onChange={(v) => setCustody(v)}
                    options={[
                      { value: "self", label: "Self-custody" },
                      { value: "turnkey", label: "Turnkey TEE", disabled: !turnkeyAvailable },
                    ]}
                  />
                </div>
              </div>
              <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 font-mono text-[10px] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-silver" />
                Celo Mainnet
              </span>
            </div>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-faint">
              {custody === "turnkey"
                ? "key lives in Turnkey's enclave — non-exportable, signs via API"
                : turnkeyAvailable === false
                  ? "self-custody · key shown once (Turnkey off — set TURNKEY_* to enable)"
                  : "self-custody · key generated in-browser, shown once"}
            </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Research Bot"
                className="field"
              />
            </Field>
            <Field label="version">
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="field"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="capabilities">
              <input
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                placeholder="research, summarization, x402-payments  ·  comma-separated"
                className="field"
              />
            </Field>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_CAPS.map((cap) => {
                const active = caps.includes(cap);
                const gate = cap === "x402-payments";
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCap(cap)}
                    title={gate ? "required for your agent to pay 402-gated services" : undefined}
                    className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      active
                        ? "border-ink bg-ink text-paper-bright"
                        : gate
                          ? "border-ink/40 bg-paper-bright/60 text-ink hover:border-ink/60"
                          : "border-ink/10 bg-paper-bright/40 text-ink-soft hover:border-ink/25"
                    }`}
                  >
                    {active ? "✓ " : gate ? "★ " : "+ "}
                    {cap}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <Field label="description">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What it does · optional"
                className="field"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="a2a endpoint">
              <input
                value={a2a}
                onChange={(e) => setA2a(e.target.value)}
                placeholder="https://… · optional"
                className="field font-mono text-[13px]"
              />
            </Field>
            <Field label="payment endpoint">
              <input
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                placeholder="https://… · optional"
                className="field font-mono text-[13px]"
              />
            </Field>
          </div>

          {/* spending policy */}
          <div className="mt-6 rounded-2xl border border-ink/10 bg-paper-bright/40 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="small-caps text-ink-faint">spending policy</p>
              <span className="font-mono text-[10px] text-ink-faint">on-chain ceiling</span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="max / tx · cUSD">
                <input value={perTx} onChange={(e) => setPerTx(e.target.value)} className="field" />
              </Field>
              <Field label="daily cap · cUSD">
                <input value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} className="field" />
              </Field>
            </div>
            <p className="mt-2 font-mono text-[10px] text-ink-faint">
              the agent can never exceed this · rotate or revoke anytime
            </p>
          </div>
        </div>

          {/* live preview + action (sticky) */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="rounded-[22px] border border-ink/10 bg-paper-bright/50 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="small-caps text-ink-faint">on-chain preview</p>
                <p className="font-mono text-[10px] text-ink-mute">≈ {onChainBytes} b</p>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <p className="font-display text-lg font-bold tracking-tight text-ink">
                  {name.trim() || "Unnamed agent"}
                </p>
                <span className="font-mono text-[11px] text-ink-faint">v{version.trim() || "0.0.0"}</span>
              </div>
              {description.trim() && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{description.trim()}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {caps.length === 0 ? (
                  <span className="font-mono text-[11px] text-ink-faint">no capabilities yet</span>
                ) : (
                  caps.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-ink/10 bg-paper-bright/80 px-2.5 py-1 font-mono text-[11px] text-ink-soft"
                    >
                      {c}
                    </span>
                  ))
                )}
              </div>
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-faint">
                owner → your wallet · signer → generated · {chain.shortName}
              </p>
            </div>

            <button
              onClick={create}
              disabled={running || !available}
              className="pill-dark inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-slate-text disabled:opacity-60"
            >
              {running ? "Creating…" : "Create agent"}
              {!running && <span className="font-mono text-xs">↗</span>}
            </button>

            {!available && (
              <p className="text-center font-mono text-[11px] text-ink-faint">
                No wallet — install MetaMask or Valora.
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
                {error}
              </p>
            )}
          </div>
        </div>

        {/* automated pipeline */}
        {steps && (
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
              {createStatus ?? "ready"}
            </p>
          </div>
        )}

        {/* one-time key reveal (self-custody) — the only time this key is shown */}
        {result?.custody === "self" && key && (
          <div className="mt-5 rounded-[24px] border-2 border-ink/25 bg-paper-dim/50 p-6 md:p-7">
            <p className="flag text-ink">⚠ save the agent&apos;s key — shown once</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
              This is the agent&apos;s private key. Envoy never stores, logs, or transmits
              it — it lives only in this browser tab. Copy it into your agent runtime&apos;s
              secrets now. Lose it and the agent can&apos;t sign; leak it and whoever holds
              it can spend up to your limits (you can revoke it on-chain at any time).
            </p>

            <p className="mt-5 small-caps text-ink-faint">agent signing address</p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">{key.address}</p>

            <p className="mt-4 small-caps text-ink-faint">private key</p>
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="pill mt-2 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-ink"
              >
                Reveal private key 👁
              </button>
            ) : (
              <>
                <pre className={`mt-2 overflow-x-auto rounded-xl border border-ink/15 bg-paper-bright/80 px-4 py-3 font-mono text-[12px] leading-relaxed text-ink ${savedAck ? "blur-sm select-none" : ""}`}>
                  {key.privateKey}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <CopyButton text={envSnippet(result, key)} label="Copy .env snippet" />
                  <button
                    onClick={() => downloadEnv(result, key)}
                    className="pill inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-ink"
                  >
                    Download .env ↧
                  </button>
                </div>
                <label className="mt-4 flex items-center gap-2.5 text-[13px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={savedAck}
                    onChange={(e) => setSavedAck(e.target.checked)}
                    className="h-4 w-4 accent-ink"
                  />
                  I&apos;ve saved the key — hide it now
                </label>
              </>
            )}
          </div>
        )}

        {/* turnkey custody — nothing to reveal; the key never left the enclave */}
        {result?.custody === "turnkey" && (
          <div className="mt-5 rounded-[24px] border-2 border-ink/20 bg-paper-dim/40 p-6 md:p-7">
            <p className="flag text-ink">🔒 key secured in turnkey (tee)</p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
              The agent&apos;s private key was generated inside Turnkey&apos;s secure
              enclave and is non-exportable — it never touched this browser. Your agent
              runtime signs payments by calling Turnkey with your API credentials; there
              is no raw key to copy out. Revoke or rotate it on-chain any time.
            </p>

            <p className="mt-5 small-caps text-ink-faint">agent signing address</p>
            <p className="mt-1 break-all font-mono text-[12px] text-ink">{result.agentAddress}</p>

            {result.turnkeyWalletId && (
              <>
                <p className="mt-4 small-caps text-ink-faint">turnkey wallet id</p>
                <p className="mt-1 break-all font-mono text-[12px] text-ink">
                  {result.turnkeyWalletId}
                </p>
              </>
            )}

            <p className="mt-4 small-caps text-ink-faint">agent runtime config</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-ink/15 bg-paper-bright/80 px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-soft">
              {`# Envoy agent runtime — Turnkey custody (no private key)\nENVOY_AGENT_ID=${result.agentId}\nENVOY_CHAIN_ID=${result.chainId}\nENVOY_AGENT_ADDRESS=${result.agentAddress}\nTURNKEY_SIGN_WITH=${result.agentAddress}\n# + your TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY / TURNKEY_ORGANIZATION_ID`}
            </pre>
          </div>
        )}

        {/* result */}
        {result && (
          <div className="glass-hot mt-5 rounded-[24px] p-6 md:p-7">
            <p className="flag text-ink">autonomous agent live ✓</p>
            <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink">
              Agent №{result.agentId}
            </p>
            <p className="mt-1.5 font-mono text-xs text-ink-mute">
              on {getCeloChain(result.chainId).shortName} · signing wallet bound
              {result.policyTx ? " · policy enforced on-chain" : ""}
            </p>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link
                href={`/fund/${result.agentId}?chain=${result.chainId}`}
                className="pill-dark inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-slate-text"
              >
                Fund this agent
                <span className="font-mono text-xs">↗</span>
              </Link>
              <a
                href={`${getCeloChain(result.chainId).explorer}/tx/${result.bindTx}`}
                target="_blank"
                rel="noreferrer"
                className="pill inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium text-ink"
              >
                View bind tx ↗
              </a>
            </div>

            <p className="mt-5 small-caps text-ink-faint">make it your default demo agent</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-ink/10 bg-paper-bright/70 px-4 py-3 font-mono text-[12px] leading-relaxed text-ink-soft">
              {`# web/.env.local\nNEXT_PUBLIC_DEFAULT_AGENT_ID=${result.agentId}\nNEXT_PUBLIC_DEFAULT_CHAIN_ID=${result.chainId}`}
            </pre>
          </div>
        )}

        {/* proof-of-human — bind a real human to the agent via a Self Agent ID */}
        {result && (
          <SelfVerify
            chainId={result.chainId}
            owner={result.owner}
            agentName={name.trim() || "Envoy agent"}
          />
        )}

        <p className="mt-6 text-center font-mono text-[11px] text-ink-faint">
          registry · {getEnvoyAddresses(chainId).identityRegistry} on {chain.shortName}
        </p>
      </main>
    </>
  );
}

function envSnippet(r: Result, k: GeneratedKey): string {
  return [
    "# Envoy agent runtime secrets — store securely, never commit",
    `ENVOY_AGENT_ID=${r.agentId}`,
    `ENVOY_CHAIN_ID=${r.chainId}`,
    `ENVOY_AGENT_ADDRESS=${k.address}`,
    `ENVOY_AGENT_PRIVATE_KEY=${k.privateKey}`,
  ].join("\n");
}

function downloadEnv(r: Result, k: GeneratedKey) {
  const blob = new Blob([envSnippet(r, k) + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `envoy-agent-${r.agentId}.env`;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — user can still download */
        }
      }}
      className="pill-dark inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-slate-text"
    >
      {copied ? "Copied ✓" : label}
    </button>
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

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
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
