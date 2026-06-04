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
          style={{ background: "linear-gradient(90deg, transparent, rgba(22,23,27,0.05), transparent)" }}
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
            className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
          >
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-ink-soft" />
              <span className="flag whitespace-nowrap text-ink">payment received</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-display text-lg font-semibold text-ink">
                {last.amountFormatted} {last.asset}
              </span>{" "}
              <span className="font-mono text-sm text-ink-mute">from {short(last.from)}</span>
            </div>
            <a
              href={`${explorer}/tx/${last.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="small-caps whitespace-nowrap text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              tx {short(last.transactionHash)} ↗
            </a>
          </motion.div>
        ) : (
          <motion.div
            key="watching"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
          >
            <div className="flex items-center gap-3">
              <motion.span
                className={`h-2 w-2 rounded-full ${status === "error" ? "bg-ink-mute" : "bg-ink-soft"}`}
                animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              <span className="flag whitespace-nowrap text-ink-mute">live · {chainShortName.toLowerCase()}</span>
            </div>
            <span className="min-w-0 flex-1 font-display text-base font-medium text-ink">
              {status === "connecting"
                ? `Opening stream to ${chainShortName}…`
                : status === "error"
                  ? "Watcher error — reconnecting"
                  : `Watching ${chainShortName} for incoming ${asset}`}
            </span>
            <div className="flex items-center gap-5">
              <span className="flag whitespace-nowrap text-ink-faint">uptime · {elapsed}</span>
              <a
                href={`${explorer}/address/${wallet}`}
                target="_blank"
                rel="noreferrer"
                className="small-caps whitespace-nowrap text-ink-soft underline underline-offset-4 hover:text-ink"
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
