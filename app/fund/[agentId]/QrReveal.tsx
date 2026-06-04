"use client";

import { motion } from "framer-motion";

/**
 * QR rendered on a clean white card. The generated SVG carries an intrinsic
 * 320px size, so we force it to fill a fixed, smaller box (`[&>svg]`) — that
 * keeps the code square, fully inside its quiet-zone margin, and scannable
 * (never clipped by the rounded container).
 */
export function QrReveal({ svg }: { svg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[26px] border border-ink/10 bg-white p-4 shadow-[0_30px_70px_-42px_rgba(22,23,27,0.5)]"
    >
      <div
        className="h-[200px] w-[200px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:[shape-rendering:crispEdges]"
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label="EIP-681 payment QR"
      />
    </motion.div>
  );
}
