"use client";

import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

const easeOut = [0.16, 1, 0.3, 1] as const;

/**
 * Terminal-style typewriter. Types each phrase out, holds, deletes, and moves to
 * the next — looping. A single phrase types once and stays. The full first phrase
 * is exposed to screen readers; the animated text is aria-hidden. Honors
 * prefers-reduced-motion (renders the first phrase, no animation).
 */
export function Typewriter({
  phrases,
  typingMs = 42,
  deletingMs = 22,
  holdMs = 2400,
  startDelayMs = 250,
  className,
  caretClassName = "caret",
}: {
  phrases: string[];
  typingMs?: number;
  deletingMs?: number;
  holdMs?: number;
  startDelayMs?: number;
  className?: string;
  caretClassName?: string;
}) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), startDelayMs);
    return () => clearTimeout(t);
  }, [startDelayMs]);

  useEffect(() => {
    if (reduce || !started) return;
    const current = phrases[index % phrases.length];
    let t: ReturnType<typeof setTimeout>;

    if (!deleting) {
      if (text.length < current.length) {
        t = setTimeout(() => setText(current.slice(0, text.length + 1)), typingMs);
      } else if (phrases.length > 1) {
        t = setTimeout(() => setDeleting(true), holdMs);
      }
    } else {
      if (text.length > 0) {
        t = setTimeout(() => setText(current.slice(0, text.length - 1)), deletingMs);
      } else {
        setDeleting(false);
        setIndex((v) => v + 1);
      }
    }
    return () => clearTimeout(t);
  }, [text, deleting, index, started, reduce, phrases, typingMs, deletingMs, holdMs]);

  const shown = reduce ? phrases[0] : text;

  return (
    <span className={className} aria-label={phrases[0]}>
      <span aria-hidden="true">{shown}</span>
      <span className={caretClassName} aria-hidden="true" />
    </span>
  );
}

/** Fade + rise on mount or scroll-into-view. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  once = true,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once, margin: "-10% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: easeOut }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.085, delayChildren: 0.1 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 40, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: easeOut },
  },
};

/** Word-by-word staggered headline. Pass an array of words. */
export function StaggerWords({
  words,
  className,
  wordClassName,
  irisIndex,
}: {
  words: string[];
  className?: string;
  wordClassName?: string;
  irisIndex?: number;
}) {
  return (
    <motion.span
      className={className}
      variants={staggerParent}
      initial="hidden"
      animate="show"
    >
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          variants={staggerChild}
          className={`inline-block ${wordClassName ?? ""} ${i === irisIndex ? "iris" : ""}`}
        >
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.span>
  );
}

/** Animated numbered step list — staggers in on scroll, numbers pop, a connector
 *  line draws down the left as the steps reveal. */
export function StepTimeline({ steps }: { steps: [string, string][] }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  return (
    <ol ref={ref} className="relative flex flex-col gap-3">
      <motion.span
        aria-hidden
        className="absolute left-[38px] top-7 bottom-7 hidden w-px origin-top bg-gradient-to-b from-ink/20 to-ink/5 sm:block"
        initial={{ scaleY: 0 }}
        animate={inView ? { scaleY: 1 } : {}}
        transition={{ duration: 0.9, ease: easeOut, delay: 0.2 }}
      />
      {steps.map(([head, body], i) => (
        <motion.li
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.12 + i * 0.13, ease: easeOut }}
          className="glass relative flex gap-5 rounded-2xl px-5 py-5"
        >
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.13, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-paper-bright font-mono text-[13px] font-semibold text-ink"
          >
            {i + 1}
          </motion.span>
          <div>
            <p className="font-display text-[16px] font-semibold text-ink">{head}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{body}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** Magnetic, spring-scaled button wrapper. */
export function Magnetic({
  children,
  className,
  strength = 0.4,
}: {
  children: React.ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18 });
  const sy = useSpring(y, { stiffness: 250, damping: 18 });

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy, display: "inline-flex" }}
      className={className}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
    >
      {children}
    </motion.span>
  );
}

/** Count-up number when scrolled into view. */
export function CountUp({
  to,
  suffix = "",
  decimals = 0,
  duration = 1.4,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref}>
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Re-export for convenience in client pages. */
export { motion, useInView, useTransform };
