"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  rightSlot?: React.ReactNode;
}

export function Masthead({ rightSlot }: Props) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-30 border-b border-flux-line/60 bg-flux-ink/60 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="group flex items-center gap-3">
          <Mark />
          <span className="font-display text-base font-bold tracking-tight text-flux-white">
            envoy
          </span>
          <span className="small-caps hidden text-flux-faint md:inline">agent bank</span>
        </Link>
        <nav className="flex items-center gap-6">
          {rightSlot}
          <a href="https://github.com/envoy-dev/envoy" className="small-caps text-flux-mute transition-colors hover:text-flux-lime">
            github
          </a>
          <a href="https://www.npmjs.com/package/envoy-pay" className="small-caps text-flux-mute transition-colors hover:text-flux-lime">
            sdk
          </a>
        </nav>
      </div>
    </motion.header>
  );
}

function Mark() {
  return (
    <motion.span
      className="relative inline-flex h-5 w-5 items-center justify-center"
      whileHover={{ rotate: 90 }}
      transition={{ type: "spring", stiffness: 200, damping: 12 }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id="markIris" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D4FF3F" />
            <stop offset="50%" stopColor="#4FE9E0" />
            <stop offset="100%" stopColor="#9B8CFF" />
          </linearGradient>
        </defs>
        <circle cx="10" cy="10" r="9" stroke="#F5F5F7" strokeOpacity="0.3" />
        <circle cx="10" cy="10" r="4" fill="url(#markIris)" />
      </svg>
    </motion.span>
  );
}
