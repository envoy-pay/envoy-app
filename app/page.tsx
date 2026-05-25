"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { DEFAULT_AGENT_ID, DEFAULT_CHAIN_ID, getCeloChain } from "@/lib/chains";
import { Masthead } from "./_components/Masthead";
import { AuroraMesh } from "./_components/AuroraMesh";
import { FundingOrbit } from "./_components/FundingOrbit";
import { Magnetic, CountUp, Reveal } from "./_components/motion";

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function HomePage() {
  const demoHref = `/fund/${DEFAULT_AGENT_ID}?chain=${DEFAULT_CHAIN_ID}`;
  const chain = getCeloChain(DEFAULT_CHAIN_ID);

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const orbitY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const orbitScale = useTransform(scrollYProgress, [0, 1], [1, 0.82]);
  const orbitOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, 60]);

  return (
    <>
      <AuroraMesh />
      <div className="grid-faint" aria-hidden />

      <Masthead rightSlot={<LiveDot label={chain.shortName} />} />

      <main
        ref={heroRef}
        className="relative mx-auto flex min-h-[calc(100vh-65px)] max-w-[1100px] flex-col items-center justify-center px-6 py-16 text-center"
      >
        {/* centered visual with scroll parallax */}
        <motion.div
          style={{ y: orbitY, scale: orbitScale, opacity: orbitOpacity }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: easeOut }}
        >
          <FundingOrbit />
        </motion.div>

        <motion.div style={{ y: textY }} className="flex flex-col items-center">
          {/* badge */}
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: easeOut }}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-flux-line bg-flux-base/60 px-3 py-1 backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-flux-lime" />
            <span className="small-caps text-flux-mute">private alpha · celo {chain.chainId}</span>
          </motion.span>

          {/* headline */}
          <h1 className="font-display font-bold leading-[0.95] tracking-[-0.04em]">
            <motion.span
              className="block text-[44px] text-flux-white md:text-[84px]"
              initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.35, duration: 0.9, ease: easeOut }}
            >
              Every agent
            </motion.span>
            <motion.span
              className="iris block text-[44px] md:text-[84px]"
              initial={{ opacity: 0, y: 40, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.5, duration: 0.9, ease: easeOut }}
            >
              gets an account.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8, ease: easeOut }}
            className="mt-7 max-w-md text-base leading-relaxed text-flux-mute md:text-lg"
          >
            ERC-8004 identity on Celo. Any rail in, cUSD out —
            <br className="hidden md:block" /> every settlement signed on-chain.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.8, ease: easeOut }}
            className="mt-9 flex items-center gap-3"
          >
            <Magnetic>
              <Link
                href={demoHref}
                className="iris-bg group inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-flux-ink shadow-[0_20px_60px_-18px_rgba(212,255,63,0.6)]"
              >
                <span className="small-caps text-flux-ink">launch a fund page</span>
                <span className="font-mono text-sm transition-transform group-hover:translate-x-0.5">↗</span>
              </Link>
            </Magnetic>
            <Magnetic strength={0.25}>
              <a
                href="https://github.com/envoy-dev/envoy"
                className="inline-flex items-center gap-2 rounded-full border border-flux-line px-6 py-3 text-flux-mute transition-colors hover:border-flux-mute hover:text-flux-white"
              >
                <span className="small-caps">view source</span>
              </a>
            </Magnetic>
          </motion.div>
        </motion.div>

        {/* scroll cue */}
        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="flag text-flux-faint">scroll</span>
        </motion.div>
      </main>

      {/* ───────── STATS ───────── */}
      <section className="relative mx-auto max-w-[1100px] px-6 py-24">
        <Reveal className="mb-10 text-center">
          <span className="small-caps text-flux-mute">the rails</span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            One URL. <span className="iris">Any rail.</span>
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat n={17} suffix="" k="chains routable" delay={0} />
          <Stat n={3} suffix="" k="stablecoins" delay={0.1} />
          <Stat n={1} suffix="" k="url per agent" delay={0.2} />
          <Stat n={100} suffix="%" k="on-chain receipts" delay={0.3} />
        </div>
      </section>

      <footer className="relative border-t border-flux-line">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
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

function LiveDot({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-flux-line px-2.5 py-1">
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-flux-lime"
        animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="small-caps text-flux-mute">live · {label}</span>
    </span>
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
        <p className="font-display text-4xl font-bold tracking-tight text-flux-white md:text-5xl">
          <CountUp to={n} suffix={suffix} />
        </p>
        <p className="mt-2 small-caps text-flux-mute">{k}</p>
      </div>
    </Reveal>
  );
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-flux-faint">
      {children}
    </span>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-flux-faint/50" aria-hidden />;
}
