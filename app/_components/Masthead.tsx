"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { DEFAULT_AGENT_ID, DEFAULT_CHAIN_ID } from "@/lib/chains";
import { useWallet } from "./WalletProvider";

interface Props {
  rightSlot?: React.ReactNode;
}

const NAV = [
  { label: "create", href: "/create" },
  { label: "how it works", href: "/how-it-works" },
  { label: "pay", href: "/pay" },
];

export function Masthead({ rightSlot }: Props) {
  const demoHref = `/fund/${DEFAULT_AGENT_ID}?chain=${DEFAULT_CHAIN_ID}`;
  const pathname = usePathname();
  // "Launch" sends you into the demo — redundant once you're already in the app.
  const showLaunch = !["/fund", "/create", "/pay"].some((p) => pathname?.startsWith(p));
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-30 border-b border-ink/[0.07] bg-paper-bright/55 backdrop-blur-xl"
    >
      <div className="flex w-full items-center justify-between gap-6 px-6 py-4 md:px-10">
        <Link href="/" className="group flex items-center gap-2.5">
          <Mark />
          <span className="font-display text-base font-extrabold tracking-tight text-ink">
            envoy
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="small-caps text-ink-mute transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {rightSlot}
          <ConnectButton />
          {showLaunch && (
            <Link
              href={demoHref}
              className="pill-dark group hidden items-center gap-1.5 rounded-full px-4 py-1.5 small-caps text-slate-text transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              launch
              <span className="font-mono text-[11px] transition-transform group-hover:translate-x-0.5">↗</span>
            </Link>
          )}
        </div>
      </div>
    </motion.header>
  );
}

function ConnectButton() {
  const { account, connecting, connect, disconnect, available, wallets } = useWallet();
  const [open, setOpen] = useState(false);

  if (account) {
    const short = `${account.slice(0, 5)}…${account.slice(-4)}`;
    return (
      <button
        onClick={disconnect}
        title="Disconnect"
        className="group inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-bright/60 px-3 py-1.5 transition-colors hover:border-ink/20"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-mute/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-soft" />
        </span>
        <span className="font-mono text-[12px] text-ink">{short}</span>
      </button>
    );
  }

  const multi = wallets.length > 1;

  return (
    <div className="relative">
      <button
        onClick={() => (multi ? setOpen((o) => !o) : connect())}
        disabled={connecting || !available}
        title={available ? "Connect a browser wallet" : "Install MetaMask or Valora"}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper-bright/50 px-4 py-1.5 small-caps text-ink transition-colors hover:border-ink/30 disabled:opacity-60"
      >
        {connecting ? "connecting…" : "connect"}
      </button>

      {open && multi && (
        <>
          <button
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-ink/10 bg-paper-bright/95 p-1.5 shadow-[0_24px_60px_-30px_rgba(22,23,27,0.4)] backdrop-blur">
            <p className="flag px-2.5 py-1.5 text-ink-faint">choose a wallet</p>
            {wallets.map((w) => (
              <button
                key={w.rdns}
                onClick={() => {
                  setOpen(false);
                  connect({ rdns: w.rdns });
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors hover:bg-ink/[0.05]"
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" className="h-4 w-4 rounded" />
                ) : null}
                {w.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Mark() {
  return (
    <motion.span
      className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-[8px] border border-ink/10"
      style={{
        background:
          "linear-gradient(160deg, #1d1e24, #0c0d11)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
      }}
      whileHover={{ rotate: 90 }}
      transition={{ type: "spring", stiffness: 200, damping: 14 }}
      aria-hidden
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, #ffffff, #b9bcc6 60%, #74767e)",
          boxShadow: "0 0 8px rgba(255,255,255,0.35)",
        }}
      />
    </motion.span>
  );
}
