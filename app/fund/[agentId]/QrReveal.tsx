"use client";

import { motion } from "framer-motion";

/** QR in a glass panel with an animated iridescent scan-line sweeping over it. */
export function QrReveal({ svg }: { svg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="glass relative overflow-hidden rounded-3xl p-5"
    >
      <div
        className="h-[240px] w-[240px]"
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label="EIP-681 payment QR"
      />
      <motion.div
        className="pointer-events-none absolute inset-x-5 h-10"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(212,255,63,0.35), transparent)",
        }}
        animate={{ top: ["8%", "92%", "8%"] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-flux-lime/70"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.span
        className="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-flux-violet/70"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1 }}
      />
    </motion.div>
  );
}
