"use client";

import { motion } from "framer-motion";

/** Living gradient-mesh background — slow morphing blobs in the flux palette. */
export function AuroraMesh() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute -left-[20%] -top-[20%] h-[70vh] w-[70vh] rounded-full"
        style={{
          background: "radial-gradient(circle, #D4FF3F 0%, transparent 60%)",
          filter: "blur(120px)",
          opacity: 0.16,
        }}
        animate={{ x: [0, 140, -40, 0], y: [0, 80, 160, 0], scale: [1, 1.18, 0.95, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-15%] top-[5%] h-[64vh] w-[64vh] rounded-full"
        style={{
          background: "radial-gradient(circle, #9B8CFF 0%, transparent 60%)",
          filter: "blur(130px)",
          opacity: 0.2,
        }}
        animate={{ x: [0, -120, 40, 0], y: [0, 120, -40, 0], scale: [1, 1.1, 1.25, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-25%] left-[25%] h-[60vh] w-[60vh] rounded-full"
        style={{
          background: "radial-gradient(circle, #4FE9E0 0%, transparent 60%)",
          filter: "blur(120px)",
          opacity: 0.14,
        }}
        animate={{ x: [0, 80, -100, 0], y: [0, -60, 40, 0], scale: [1, 1.2, 1, 1] }}
        transition={{ duration: 29, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
