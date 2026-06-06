"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { CountUp } from "./motion";

const easeOut = [0.16, 1, 0.3, 1] as const;

interface Props {
  agentId?: string;
  /** Full agent signing wallet (0x…) — shown as the account number and copied on click. */
  wallet?: string;
  /** Last-4 fallback when the full wallet isn't available. */
  walletTail?: string;
  balance?: number;
  network?: string;
  /** When set, the card hydrates agentId / wallet / balance from chain via /api/agent. */
  fetchAgentId?: string;
  chainId?: number;
}

interface LiveAgent {
  agentId: string;
  wallet?: string;
  walletTail: string;
  balance: number | null;
  live: boolean;
}

/**
 * Envoy's hero centerpiece — an on-chain *account* credential for an AI agent.
 * The one object with weight on the page: a near-black graphite card resting on
 * the silver surface, with brushed-platinum detailing. A card-format read on
 * ERC-8004 identity — agent id, agent wallet, live cUSD balance, settling on
 * Celo. Tilts toward the pointer with a soft white glare; pure greyscale.
 */
export function AgentAccountCard({
  agentId = "00128",
  wallet,
  walletTail = "A432",
  balance = 42.1,
  network = "Celo",
  fetchAgentId,
  chainId,
}: Props) {
  // Optionally hydrate from chain — the card then shows a real wallet + live balance.
  const [live, setLive] = useState<LiveAgent | null>(null);
  useEffect(() => {
    if (!fetchAgentId) return;
    let cancelled = false;
    const q = chainId ? `?chain=${chainId}` : "";
    fetch(`/api/agent/${fetchAgentId}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled || d?.error) return;
        setLive({
          agentId: String(d.agentId),
          wallet: d.agentWallet ?? undefined,
          walletTail: d.walletTail ?? walletTail,
          balance: d.balance != null ? Number(d.balance) : null,
          live: true,
        });
      })
      .catch(() => {
        /* keep illustrative defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAgentId, chainId, walletTail, balance]);

  const shownId = live?.agentId ?? agentId;
  const shownWallet = live?.wallet ?? wallet;
  const shownTail = live?.walletTail ?? walletTail;
  // In live mode, balance may legitimately be null (RPC unreachable) — show "—",
  // never the illustrative default, so the hero never displays a fabricated number.
  const shownBalance: number | null = live ? live.balance : balance;
  const isLive = live?.live ?? false;

  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), {
    stiffness: 150,
    damping: 18,
  });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), {
    stiffness: 150,
    damping: 18,
  });

  const glareX = useTransform(mx, [-0.5, 0.5], ["12%", "88%"]);
  const glareY = useTransform(my, [-0.5, 0.5], ["8%", "92%"]);
  const glare = useMotionTemplate`radial-gradient(440px circle at ${glareX} ${glareY}, rgba(255,255,255,0.14), transparent 55%)`;

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }
  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateX: 12 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1.1, ease: easeOut, delay: 0.2 }}
      style={{ perspective: 1400 }}
      className="relative w-full max-w-[460px]"
    >
      {/* neutral halo — lifts the dark card off the silver surface */}
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-[48px] opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(58% 58% at 60% 35%, rgba(255,255,255,0.65), transparent 70%), radial-gradient(60% 60% at 40% 85%, rgba(120,124,134,0.30), transparent 72%)",
        }}
      />

      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={reset}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="group relative aspect-[1.586/1] w-full overflow-hidden rounded-[24px] p-7 shadow-[0_44px_110px_-34px_rgba(20,21,26,0.55)]"
      >
        {/* layered surface: neutral graphite with a faint top-light */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(155deg, #1b1d24 0%, #101117 46%, #08090d 100%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.12), transparent 32%)",
          }}
        />
        {/* static diagonal sheen — brushed-metal highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 47%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 53%, transparent 70%)",
          }}
        />
        {/* silver hairline border */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[24px]"
          style={{
            padding: "1px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.06) 45%, rgba(199,201,209,0.32))",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        {/* cursor glare */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: glare }}
        />

        {/* ── content ── */}
        <div className="relative flex h-full flex-col justify-between">
          {/* header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="flag text-slate-mute">agent account</p>
              <p className="mt-1.5 font-display text-[15px] font-extrabold tracking-tight text-slate-text">
                envoy
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
              {isLive ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-silver/70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-silver shadow-[0_0_8px_rgba(199,201,209,0.7)]" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-slate-silver shadow-[0_0_8px_rgba(199,201,209,0.7)]" />
              )}
              <span className="small-caps text-slate-mute">{isLive ? "live" : network}</span>
            </span>
          </div>

          {/* chip + account number (click to copy the full wallet) */}
          <div>
            <Chip />
            <AccountNumber wallet={shownWallet} tail={shownTail} />
          </div>

          {/* footer row */}
          <div className="flex items-end justify-between">
            <Field label="agent id">
              <span className="font-mono text-sm text-slate-text">#{shownId}</span>
            </Field>
            <Field label="balance">
              <span className="font-mono text-sm text-slate-text">
                {shownBalance === null ? (
                  "—"
                ) : (
                  <CountUp to={shownBalance} decimals={2} duration={1.8} />
                )}
                <span className="ml-1 text-slate-mute">cUSD</span>
              </span>
            </Field>
            <Field label="standard" align="right">
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-slate-text">8004</span>
                <Brand />
              </span>
            </Field>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Chip() {
  return (
    <div className="relative h-9 w-12 overflow-hidden rounded-md">
      {/* brushed platinum */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #e9ebef 0%, #9a9da6 38%, #f4f5f8 60%, #7e818b 100%)",
        }}
      />
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={i} className="border border-black/25" />
        ))}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <span className="h-[3px] w-[3px] rounded-full bg-slate-mute/70" key={i} />
      ))}
    </span>
  );
}

/**
 * The card's "account number": the agent's real signing wallet, shown as
 * head + masked middle + tail, and copied in full on click. Falls back to the
 * stylized ERC-8004 motif only when no real wallet is available.
 */
function AccountNumber({ wallet, tail }: { wallet?: string; tail: string }) {
  const [copied, setCopied] = useState(false);
  const isAddr = !!wallet && wallet.startsWith("0x") && wallet.length >= 10;
  const head = isAddr ? `0x${wallet!.slice(2, 6)}` : "0x8004";
  const end = isAddr ? wallet!.slice(-4).toUpperCase() : tail;

  const cls =
    "mt-4 flex items-center gap-3 font-mono text-[clamp(15px,2.4vw,20px)] tracking-[0.12em] text-slate-text/90";

  const number = (
    <span className="flex items-center gap-3">
      <span>{head}</span>
      <Dots />
      <Dots />
      <span>{end}</span>
    </span>
  );

  if (!isAddr) return <div className={cls}>{number}</div>;

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(wallet!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${wallet}`}
      aria-label="Copy agent wallet address"
      className={`group/acct ${cls} cursor-pointer text-left transition-opacity hover:opacity-90`}
    >
      {number}
      <span className="ml-1 small-caps text-[10px] text-slate-mute opacity-0 transition-opacity group-hover/acct:opacity-100">
        {copied ? "copied ✓" : "copy"}
      </span>
    </button>
  );
}

function Field({
  label,
  children,
  align = "left",
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="flag mb-1 text-slate-mute">{label}</p>
      {children}
    </div>
  );
}

/** Two overlapping discs — Envoy's payment mark, platinum over graphite. */
function Brand() {
  return (
    <span className="relative inline-flex h-5 w-8 items-center" aria-hidden>
      <span className="absolute left-0 h-5 w-5 rounded-full bg-slate-silver/90" />
      <span className="absolute left-3 h-5 w-5 rounded-full border border-white/30 bg-slate-mute/40 backdrop-blur-[1px]" />
    </span>
  );
}
