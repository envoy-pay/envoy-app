"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { DEFAULT_AGENT_ID, DEFAULT_CHAIN_ID, getCeloChain } from "@/lib/chains";
import { Masthead } from "./_components/Masthead";
import { AgentAccountCard } from "./_components/AgentAccountCard";
import { Magnetic, CountUp, Reveal, Typewriter } from "./_components/motion";

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function HomePage() {
  const demoHref = `/fund/${DEFAULT_AGENT_ID}?chain=${DEFAULT_CHAIN_ID}`;
  const chain = getCeloChain(DEFAULT_CHAIN_ID);

  return (
    <>
      <Masthead />

      {/* ───────────────────── HERO ───────────────────── */}
      <main className="relative mx-auto max-w-[1180px] px-6">
        <div className="grid min-h-[calc(100vh-69px)] grid-cols-1 items-center gap-14 py-16 md:grid-cols-[1.04fr_0.96fr] md:gap-10">
          {/* left — the agent introduces itself */}
          <div className="flex flex-col items-start">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: easeOut }}
              className="inline-flex items-center gap-2 small-caps text-ink-faint"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-mute/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-soft" />
              </span>
              live · celo mainnet · erc-8004
            </motion.span>

            {/* faint greeting — the system line */}
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22, duration: 0.7, ease: easeOut }}
              className="mt-7 max-w-[34rem] text-[15px] leading-relaxed text-ink-faint"
            >
              Hey — I&apos;m agent #00128. Autonomous, running on Celo, and as of
              today I&apos;ve got my own account.
            </motion.p>

            {/* bold line — the agent's voice, auto-typing */}
            <motion.h1
              initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.34, duration: 0.9, ease: easeOut }}
              className="mt-5 flex min-h-[3.2em] max-w-[16ch] items-start font-display text-[clamp(36px,5vw,60px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink"
            >
              <Typewriter
                phrases={[
                  "I get paid, I pay out, and I keep every receipt.",
                  "Mint me an identity. Fund me. Watch it land.",
                  "No human co-signs a single move I make.",
                  "Any rail in — cUSD out, signed on-chain.",
                ]}
              />
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8, ease: easeOut }}
              className="mt-6 max-w-[31rem] text-[17px] leading-relaxed text-ink-soft"
            >
              No human co-signs my moves. Mint me an{" "}
              <span className="font-medium text-ink">ERC-8004 identity</span>, send
              money down any rail, and I settle it in{" "}
              <span className="font-medium text-ink">cUSD</span> on Celo — every
              payment signed by me.
            </motion.p>

            {/* pills — quick actions, Locomotive-style */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.74, duration: 0.8, ease: easeOut }}
              className="mt-9 flex flex-wrap items-center gap-2.5"
            >
              <Magnetic>
                <Link
                  href={demoHref}
                  className="pill-dark group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-slate-text"
                >
                  Fund me
                  <span className="font-mono text-xs transition-transform group-hover:translate-x-0.5">
                    ↗
                  </span>
                </Link>
              </Magnetic>
              <PillLink href="/create">Create an agent</PillLink>
              <PillLink href="/how-it-works">How it works</PillLink>
              <CopyPill cmd="npm i envoy-pay" />
            </motion.div>
          </div>

          {/* right — the agent's credential */}
          <div className="flex justify-center md:justify-end">
            <AgentAccountCard
              network={chain.shortName}
              fetchAgentId={DEFAULT_AGENT_ID}
              chainId={DEFAULT_CHAIN_ID}
            />
          </div>
        </div>
      </main>

      {/* ───────────────────── RAILS ───────────────────── */}
      <section id="rails" className="relative mx-auto max-w-[1180px] scroll-mt-24 px-6 py-24">
        <Reveal className="mb-10 max-w-[42rem]">
          <span className="small-caps text-ink-mute">the rails</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-5xl">
            Send it however you&apos;ve got it.
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-soft">
            Card, stablecoin, wallet — it all lands in one account and settles in
            cUSD. One identity, any rail, a receipt for every move.
          </p>
        </Reveal>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat n={17} suffix="" k="chains routable" delay={0} />
          <Stat n={3} suffix="" k="stablecoins" delay={0.08} />
          <Stat n={1} suffix="" k="account per agent" delay={0.16} />
          <Stat n={100} suffix="%" k="on-chain receipts" delay={0.24} />
        </div>
      </section>

      <footer className="relative border-t border-ink/[0.08]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
          <Feat>erc-8004</Feat>
          <Dot />
          <Feat>cUSD settlement</Feat>
          <Dot />
          <Feat>on-chain receipts</Feat>
          <Dot />
          <Feat>open source</Feat>
        </div>
      </footer>
    </>
  );
}

function PillLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="pill inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium text-ink transition-transform hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

function CopyPill({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={copy}
      className="group inline-flex items-center gap-2.5 rounded-full border border-ink/10 bg-paper-bright/40 py-2.5 pl-4 pr-3 backdrop-blur transition-colors hover:border-ink/20"
    >
      <span className="font-mono text-[13px] text-ink-soft">
        <span className="select-none text-ink-faint">$ </span>
        {cmd}
      </span>
      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-ink/10 text-ink-mute transition-colors group-hover:text-ink">
        {copied ? <span className="text-xs text-ink">✓</span> : <CopyGlyph />}
      </span>
    </button>
  );
}

function CopyGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" />
      <path
        d="M3.5 10.5H3a1.5 1.5 0 0 1-1.5-1.5V3A1.5 1.5 0 0 1 3 1.5h6A1.5 1.5 0 0 1 10.5 3v.5"
        stroke="currentColor"
      />
    </svg>
  );
}

function Stat({
  n,
  suffix,
  k,
  delay,
}: {
  n: number;
  suffix: string;
  k: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="glass rounded-2xl px-6 py-8 text-center">
        <p className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          <CountUp to={n} suffix={suffix} />
        </p>
        <p className="mt-2 small-caps text-ink-mute">{k}</p>
      </div>
    </Reveal>
  );
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
      {children}
    </span>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-ink-faint/50" aria-hidden />;
}
