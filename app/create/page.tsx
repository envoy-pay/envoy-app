"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { CELO_MAINNET, CELO_SEPOLIA, getCeloChain } from "@/lib/chains";
import {
  dataUriSize,
  encodeDataURI,
  type AgentCardData,
} from "@/lib/agentCard";

const SEMVER = /^\d+\.\d+\.\d+/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const PERIOD = 86_400; // 1-day spending window for the policy

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
  const [chainId, setChainId] = useState<number>(CELO_MAINNET);
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

  const { available } = useWallet();
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
      const { account, walletClient, publicClient } = await connectWallet(chainId);
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
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
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

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[680px] px-6 pb-28 pt-16">
        <span className="small-caps text-ink-mute">mint · erc-8004 · autonomous</span>
        <h1 className="mt-4 font-display text-[clamp(34px,5vw,54px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink">
          Give your agent its own account.
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
          Register a fresh ERC-8004 identity on Celo. You keep the NFT and set the
          spending limits; the agent gets <span className="font-medium text-ink">its own
          signing key</span> and pays autonomously within them — no wallet pop-ups at
          run time, the card written <span className="font-medium text-ink">on-chain</span>.
        </p>

        {/* builder */}
        <div className="glass mt-9 rounded-[24px] p-6 md:p-7">
          <p className="small-caps text-ink-faint">network</p>
          <div className="mt-2.5 flex gap-2">
            <NetBtn active={chainId === CELO_SEPOLIA} onClick={() => setChainId(CELO_SEPOLIA)}>
              Celo Sepolia <span className="text-ink-faint">testnet</span>
            </NetBtn>
            <NetBtn active={chainId === CELO_MAINNET} onClick={() => setChainId(CELO_MAINNET)}>
              Celo Mainnet <span className="text-ink-faint">real gas</span>
            </NetBtn>
          </div>
          {chainId === CELO_SEPOLIA && (
            <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-ink-faint">
              note: the facilitator (spending policy + /pay) is Celo Mainnet only — on
              Sepolia we mint + bind the key, but skip the on-chain limit. Mint on Mainnet
              for the full autonomous flow.
            </p>
          )}

          <p className="mt-6 small-caps text-ink-faint">key custody</p>
          <div className="mt-2.5 flex gap-2">
            <NetBtn active={custody === "self"} onClick={() => setCustody("self")}>
              Self-custody <span className="text-ink-faint">reveal once</span>
            </NetBtn>
            <NetBtn
              active={custody === "turnkey"}
              disabled={!turnkeyAvailable}
              onClick={() => setCustody("turnkey")}
            >
              Turnkey <span className="text-ink-faint">TEE</span>
            </NetBtn>
          </div>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-faint">
            {turnkeyAvailable === false
              ? "turnkey not configured on this server — set TURNKEY_* in web/.env.local to enable. self-custody works now."
              : custody === "turnkey"
                ? "key born inside Turnkey's enclave (non-exportable), signs via API — nothing to copy out"
                : "key generated in this browser, shown once — you store it in your agent's secrets"}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
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
                className="field sm:w-28"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="capabilities">
              <input
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
                placeholder="research, summarization, x402-payments"
                className="field"
              />
            </Field>
            <p className="mt-1.5 font-mono text-[11px] text-ink-faint">comma-separated</p>
          </div>

          <div className="mt-4">
            <Field label="description (optional)">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Summarizes papers and pays per API call."
                className="field"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="a2a endpoint (optional)">
              <input
                value={a2a}
                onChange={(e) => setA2a(e.target.value)}
                placeholder="https://api.bot.xyz/a2a"
                className="field"
              />
            </Field>
            <Field label="payment endpoint (optional)">
              <input
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                placeholder="https://api.bot.xyz/pay"
                className="field"
              />
            </Field>
          </div>

          {/* autonomous spending policy */}
          <div className="mt-6 rounded-2xl border border-ink/10 bg-paper-bright/40 p-5">
            <p className="small-caps text-ink-faint">autonomous spending policy</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
              The hard ceiling the facilitator enforces on-chain. The agent signs its own
              payments, but can never exceed these — you can rotate or revoke its key any time.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="max per transaction (cUSD)">
                <input
                  value={perTx}
                  onChange={(e) => setPerTx(e.target.value)}
                  disabled={!isMainnet}
                  className="field disabled:opacity-50"
                />
              </Field>
              <Field label="daily cap (cUSD)">
                <input
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  disabled={!isMainnet}
                  className="field disabled:opacity-50"
                />
              </Field>
            </div>
            {!isMainnet && (
              <p className="mt-2 font-mono text-[11px] text-ink-faint">
                policy disabled on Sepolia — facilitator not deployed there
              </p>
            )}
          </div>
        </div>

        {/* live preview */}
        <div className="mt-4 rounded-[24px] border border-ink/10 bg-paper-bright/50 p-6">
          <div className="flex items-baseline justify-between gap-3">
            <p className="small-caps text-ink-faint">agent card · on-chain preview</p>
            <p className="font-mono text-[11px] text-ink-mute">≈ {onChainBytes} bytes</p>
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
          <p className="mt-3 font-mono text-[11px] text-ink-faint">
            owner → your wallet · signing wallet → generated for the agent · stored as a
            data: URI on {chain.shortName}
          </p>
        </div>

        <button
          onClick={create}
          disabled={running || !available}
          className="pill-dark mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-slate-text disabled:opacity-60"
        >
          {running ? "Creating agent…" : "Create autonomous agent"}
          {!running && <span className="font-mono text-xs">↗</span>}
        </button>

        {!available && (
          <p className="mt-3 text-center font-mono text-[11px] text-ink-faint">
            No browser wallet detected — install MetaMask or Valora to mint.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
            {error}
          </p>
        )}

        {/* step tracker */}
        {steps && (
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

function NetBtn({
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
