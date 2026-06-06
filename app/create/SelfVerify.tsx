"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  selfNetworkForChain,
  selfExplorerBase,
  type SelfRegisterResponse,
  type SelfStatusResponse,
} from "@/lib/self";

type Phase = "idle" | "starting" | "scanning" | "done" | "error";

interface Props {
  chainId: number;
  /** The connected owner wallet — the human the proof binds to. */
  owner: `0x${string}`;
  /** The agent's display name, reused as the Self agent label. */
  agentName: string;
}

/**
 * Optional proof-of-human step. Binds the owner's passport ZK-proof to a Self
 * Agent ID on Celo — the id the hackathon submission asks for, and the Self
 * integration track. Self runs the registration; the owner just scans a passport.
 *
 * Honest scope: this mints a Self-managed key bound to the OWNER's passport, so
 * it proves a real human stands behind the agent. Making the agent's *own signing
 * key* human-backed (what the merchant proof-of-human demo checks) is the unified
 * `npm run register:self` path in the SDK repo — noted below.
 */
export function SelfVerify({ chainId, owner, agentName }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<SelfRegisterResponse | null>(null);
  const [selfAgentId, setSelfAgentId] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optional disclosure gates.
  const [age18, setAge18] = useState(false);
  const [ofac, setOfac] = useState(false);

  const network = selfNetworkForChain(chainId);
  const tokenRef = useRef<string | null>(null);
  const cancelled = useRef(false);

  useEffect(
    () => () => {
      cancelled.current = true;
    },
    [],
  );

  const start = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/self/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId,
          humanAddress: owner,
          agentName,
          minimumAge: age18 ? 18 : undefined,
          ofac: ofac || undefined,
        }),
      });
      const data: SelfRegisterResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not start Self registration.");
      cancelled.current = false;
      tokenRef.current = data.sessionToken;
      setSession(data);
      setPhase("scanning");
    } catch (err) {
      setError((err as Error)?.message ?? "Could not start Self registration.");
      setPhase("error");
    }
  }, [chainId, owner, agentName, age18, ofac]);

  // Poll the rolling session token until the proof lands on-chain.
  useEffect(() => {
    if (phase !== "scanning") return;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled.current) return;
      const token = tokenRef.current;
      if (!token) return;
      try {
        const res = await fetch(`/api/self/status?token=${encodeURIComponent(token)}`);
        const data: SelfStatusResponse & { error?: string } = await res.json();
        if (cancelled.current) return;
        if (!res.ok) throw new Error(data?.error ?? "Status check failed.");
        if (data.sessionToken) tokenRef.current = data.sessionToken;

        if (data.stage === "completed") {
          setSelfAgentId(typeof data.agentId === "number" ? data.agentId : null);
          setTxHash(data.txHash ?? null);
          setPhase("done");
          return;
        }
        if (data.stage === "failed") {
          setError("Registration failed on-chain.");
          setPhase("error");
          return;
        }
        if (data.stage === "expired") {
          setError("The registration session expired — start again.");
          setPhase("error");
          return;
        }
      } catch (err) {
        if (cancelled.current) return;
        setError((err as Error)?.message ?? "Status check failed.");
        setPhase("error");
        return;
      }
      timer = setTimeout(tick, 5000);
    };

    timer = setTimeout(tick, 5000);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div className="mt-5 rounded-[24px] border border-ink/10 bg-paper-bright/50 p-6 md:p-7">
      <p className="small-caps text-ink-faint">proof-of-human · self agent id</p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
        Bind a real human (you) to this agent with a passport proof — verified in
        zero-knowledge, nothing leaves your phone. You get a{" "}
        <span className="font-medium text-ink">Self Agent ID</span> on Celo{" "}
        {network === "mainnet" ? "(real passport)" : "(mock passport on testnet)"} — the id
        the hackathon submission asks for, and the Self integration track.
      </p>

      {phase === "idle" && (
        <>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={age18} onChange={(e) => setAge18(e.target.checked)} className="h-4 w-4 accent-ink" />
              require age ≥ 18
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-soft">
              <input type="checkbox" checked={ofac} onChange={(e) => setOfac(e.target.checked)} className="h-4 w-4 accent-ink" />
              require OFAC screening
            </label>
          </div>
          <button
            onClick={start}
            className="pill-dark mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-slate-text"
          >
            Get a Self Agent ID
            <span className="font-mono text-xs">↗</span>
          </button>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-ink-faint">
            note: this proves a human is behind the agent (owner-bound). to make the agent&apos;s
            own signing key human-backed — what a merchant proof-of-human gate checks — use the
            unified <span className="text-ink-mute">npm run register:self</span> flow in the SDK.
          </p>
        </>
      )}

      {phase === "starting" && (
        <p className="mt-4 font-mono text-[12px] text-ink-mute">opening a registration session…</p>
      )}

      {phase === "scanning" && session && (
        <div className="mt-5">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {session.qrImageBase64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${session.qrImageBase64}`}
                alt="Self registration QR"
                width={176}
                height={176}
                className="rounded-xl border border-ink/10 bg-white p-2"
              />
            )}
            <div className="flex-1">
              <p className="flag text-ink">scan with the Self app</p>
              <ol className="mt-2 flex flex-col gap-1 text-[13px] leading-relaxed text-ink-soft">
                {session.humanInstructions.map((line, i) => (
                  <li key={i}>
                    {i + 1}. {line}
                  </li>
                ))}
              </ol>
              <a
                href={session.scanUrl ?? session.deepLink}
                target="_blank"
                rel="noreferrer"
                className="pill mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-ink"
              >
                Open in Self app ↗
              </a>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-ink-mute">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-ink/30" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-ink" />
            </span>
            waiting for the passport proof to land on-chain…
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-ink-faint">
            agent address · {session.agentAddress}
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className="mt-5 rounded-2xl border-2 border-ink/20 bg-paper-dim/40 p-5">
          <p className="flag text-ink">human-backed ✓ — self agent id</p>
          {selfAgentId !== null ? (
            <>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink">
                Self Agent #{selfAgentId}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Put <span className="font-medium text-ink">{selfAgentId}</span> in your submission
                tweet as the Self Agent ID. It&apos;s a soulbound proof that a real, ZK-verified
                human stands behind this agent.
              </p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-ink-soft">Registered — check the Self app for your agent id.</p>
          )}
          {txHash && (
            <a
              href={`${selfExplorerBase(network)}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="pill mt-3 inline-flex items-center rounded-full px-5 py-2.5 text-[13px] font-medium text-ink"
            >
              View registration tx ↗
            </a>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="mt-4">
          <p className="rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
            {error}
          </p>
          <button
            onClick={() => {
              setPhase("idle");
              setSession(null);
              setError(null);
            }}
            className="pill mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-ink"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
