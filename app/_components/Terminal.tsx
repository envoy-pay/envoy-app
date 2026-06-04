"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

type Kind = "cmd" | "info" | "ok" | "dim";
export interface TermLine {
  k: Kind;
  t: string;
}

const PREFIX: Record<Kind, string> = { cmd: "$ ", info: "› ", ok: "✓ ", dim: "  " };
const TONE: Record<Kind, string> = {
  cmd: "text-slate-text",
  info: "text-slate-mute",
  ok: "text-white",
  dim: "text-slate-mute/60",
};

/**
 * A faux terminal that streams a fund→settle cycle line-by-line, then loops.
 * Plays only while in view; honors prefers-reduced-motion (renders all lines).
 */
export function Terminal({ lines }: { lines: TermLine[] }) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "-20% 0px" });
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (reduce) {
      setVisible(lines.length);
      return;
    }
    if (!inView) return;

    let timer: ReturnType<typeof setTimeout>;
    if (visible >= lines.length) {
      timer = setTimeout(() => setVisible(0), 3600); // hold, then loop
    } else {
      const line = lines[visible];
      const delay =
        line.k === "cmd" ? 700 : line.k === "ok" ? 820 : line.k === "dim" ? 360 : 520;
      timer = setTimeout(() => setVisible((v) => v + 1), delay);
    }
    return () => clearTimeout(timer);
  }, [inView, visible, reduce, lines]);

  return (
    <div
      ref={ref}
      className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_44px_110px_-40px_rgba(20,21,26,0.55)]"
      style={{ background: "linear-gradient(160deg, #1b1d24, #0c0d11)" }}
    >
      {/* title bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-slate-mute">envoy@celo — live</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-silver/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-slate-silver" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-mute">
            mainnet
          </span>
        </span>
      </div>

      {/* body */}
      <div className="min-h-[320px] px-5 py-4 font-mono text-[12.5px] leading-[1.85] sm:text-[13px]">
        {lines.slice(0, visible).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
            className={TONE[line.k]}
          >
            <span className="select-none opacity-70">{PREFIX[line.k]}</span>
            {line.t}
            {i === visible - 1 && <span className="caret" aria-hidden />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
