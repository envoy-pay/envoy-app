"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface PaymentEvent {
  amountFormatted: string;
  asset: string;
  from: string;
  transactionHash: string;
  timestamp: string;
}

interface Props {
  wallet: `0x${string}`;
  chainId: number;
  asset: string;
  chainShortName: string;
  explorer: string;
}

export function WatcherBanner({ wallet, chainId, asset, chainShortName, explorer }: Props) {
  const [status, setStatus] = useState<"connecting" | "watching" | "received" | "error">("connecting");
  const [last, setLast] = useState<PaymentEvent | null>(null);
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const url = `/api/watch/${wallet}?chain=${chainId}&asset=${asset}`;
    const es = new EventSource(url);
    es.addEventListener("open", () => {
      setStatus("watching");
      setConnectedAt(new Date());
    });
    es.addEventListener("payment", (e) => {
      setLast(JSON.parse((e as MessageEvent).data) as PaymentEvent);
      setStatus("received");
    });
    es.addEventListener("error", () => setStatus("error"));
    return () => es.close();
  }, [wallet, chainId, asset]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = connectedAt ? formatElapsed(now.getTime() - connectedAt.getTime()) : "—";

  return (
    <div className="glass relative overflow-hidden rounded-2xl px-5 py-4">
      {/* sweeping scan bar while watching */}
      {status === "watching" && (
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-1/3"
          style={{ background: "linear-gradient(90deg, transparent, rgba(79,233,224,0.08), transparent)" }}
          animate={{ left: ["-33%", "100%"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <AnimatePresence mode="wait">
        {status === "received" && last ? (
          <motion.div
            key="received"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative grid grid-cols-12 items-baseline gap-x-6"
          >
            <div className="col-span-12 flex items-baseline gap-3 md:col-span-3">
              <span className="h-2 w-2 rounded-full bg-flux-lime" />
              <span className="flag text-flux-lime">payment received</span>
            </div>
            <div className="col-span-12 md:col-span-6">
              <span className="font-display text-xl font-semibold text-flux-white">
                {last.amountFormatted} {last.asset}
              </span>{" "}
              <span className="font-mono text-sm text-flux-mute">from {short(last.from)}</span>
            </div>
            <div className="col-span-12 md:col-span-3 md:text-right">
              <a
                href={`${explorer}/tx/${last.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="small-caps text-flux-lime underline underline-offset-4 hover:text-flux-white"
              >
                tx {short(last.transactionHash)} ↗
              </a>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="watching"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative grid grid-cols-12 items-baseline gap-x-6"
          >
            <div className="col-span-12 flex items-baseline gap-3 md:col-span-3">
              <motion.span
                className={`h-2 w-2 rounded-full ${status === "error" ? "bg-flux-violet" : "bg-flux-cyan"}`}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              <span className="flag text-flux-mute">live · {chainShortName.toLowerCase()}</span>
            </div>
            <div className="col-span-12 md:col-span-6">
              <span className="font-display text-lg font-medium text-flux-white">
                {status === "connecting"
                  ? `Opening stream to ${chainShortName}…`
                  : status === "error"
                    ? "Watcher error — reconnecting"
                    : `Watching ${chainShortName} for incoming ${asset}`}
              </span>
            </div>
            <div className="col-span-12 flex items-baseline justify-between gap-4 md:col-span-3 md:justify-end">
              <span className="flag text-flux-faint">uptime · {elapsed}</span>
              <a
                href={`${explorer}/address/${wallet}`}
                target="_blank"
                rel="noreferrer"
                className="small-caps text-flux-lime underline underline-offset-4 hover:text-flux-white"
              >
                wallet ↗
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function short(addr: string) {
  if (!addr.startsWith("0x") || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatElapsed(ms: number) {
  if (ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${(s % 60).toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}
