/**
 * Durable idempotency for Stripe → cUSD settlement.
 *
 * The webhook moves real funds, so "process each checkout session exactly once"
 * must survive across serverless instances and retries — an in-process Set does
 * not. This is a small lease-locked key/value store over the Upstash/Vercel-KV
 * REST API (raw fetch, no SDK — same posture as the rest of the app), with an
 * in-memory fallback so the app still runs locally without KV configured.
 *
 * Lifecycle (see app/api/stripe/webhook/route.ts):
 *   claim(id)        → "claimed"  you own it; proceed to settle
 *                    → "settled"  already done; return the recorded txHash
 *                    → "pending"  another worker holds the lease; tell Stripe to retry
 *   markSettled(id)  → record the txHash permanently (clears the lease TTL)
 *   release(id)      → drop the claim so a retry can settle (only on transfer failure)
 *
 * The claim is a *lease* (NX + short TTL): if the worker that claimed it crashes
 * mid-settlement, the lease expires and Stripe's next retry can re-claim. A
 * settled record is written WITHOUT a TTL, so it dedupes forever.
 *
 * Config (either naming works):
 *   KV_REST_API_URL / KV_REST_API_TOKEN              (Vercel KV)
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (native Upstash)
 */

export type ClaimResult =
  | { state: "claimed" }
  | { state: "settled"; txHash?: string }
  | { state: "pending" };

export interface SettlementStore {
  claim(sessionId: string): Promise<ClaimResult>;
  markSettled(sessionId: string, txHash: string): Promise<void>;
  release(sessionId: string): Promise<void>;
  /** "redis" (durable, cross-instance) or "memory" (per-instance, dev only). */
  readonly backend: "redis" | "memory";
  readonly durable: boolean;
}

// How long a claim is held before it's assumed crashed and can be re-taken. A
// settlement is a single ERC-20 transfer + receipt wait (~seconds on Celo); 10
// minutes is comfortably longer while still freeing a genuinely dead claim.
const LEASE_SECONDS = 600;
const KEY_PREFIX = "envoy:stripe:settle:";

const REDIS_URL =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "";
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

interface StoredRecord {
  status: "pending" | "settled";
  txHash?: string;
}

// ── Redis (Upstash REST) ──────────────────────────────────────────────────────

/** Run one Redis command via the Upstash REST API. Throws on transport/API error. */
async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    // Settlement must never read a stale/cached response.
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { result?: unknown; error?: string }
    | null;
  if (!res.ok || !json || json.error) {
    throw new Error(`KV ${args[0]} failed: ${json?.error ?? `HTTP ${res.status}`}`);
  }
  return json.result;
}

const redisStore: SettlementStore = {
  backend: "redis",
  durable: true,

  async claim(sessionId) {
    const key = KEY_PREFIX + sessionId;
    const pending = JSON.stringify({ status: "pending" } satisfies StoredRecord);

    const set = await redisCommand(["SET", key, pending, "NX", "EX", LEASE_SECONDS]);
    if (set === "OK") return { state: "claimed" };

    // Key exists — inspect it.
    const raw = await redisCommand(["GET", key]);
    if (raw == null) {
      // Lease expired between SET and GET; try once more to take it.
      const retry = await redisCommand(["SET", key, pending, "NX", "EX", LEASE_SECONDS]);
      return retry === "OK" ? { state: "claimed" } : { state: "pending" };
    }
    const rec = parseRecord(raw);
    if (rec?.status === "settled") return { state: "settled", txHash: rec.txHash };
    return { state: "pending" };
  },

  async markSettled(sessionId, txHash) {
    // No TTL → permanent dedupe record. Plain SET clears the lease's TTL.
    await redisCommand([
      "SET",
      KEY_PREFIX + sessionId,
      JSON.stringify({ status: "settled", txHash } satisfies StoredRecord),
    ]);
  },

  async release(sessionId) {
    await redisCommand(["DEL", KEY_PREFIX + sessionId]);
  },
};

// ── In-memory fallback (dev only — per instance, not durable) ─────────────────

interface MemEntry {
  rec: StoredRecord;
  expiresAt: number | null; // epoch ms; null = no expiry (settled)
}
const mem = new Map<string, MemEntry>();

const memoryStore: SettlementStore = {
  backend: "memory",
  durable: false,

  async claim(sessionId) {
    const now = Date.now();
    const existing = mem.get(sessionId);
    if (existing && (existing.expiresAt === null || existing.expiresAt > now)) {
      if (existing.rec.status === "settled") {
        return { state: "settled", txHash: existing.rec.txHash };
      }
      return { state: "pending" };
    }
    // Absent or lease expired → claim it.
    mem.set(sessionId, {
      rec: { status: "pending" },
      expiresAt: now + LEASE_SECONDS * 1000,
    });
    return { state: "claimed" };
  },

  async markSettled(sessionId, txHash) {
    mem.set(sessionId, { rec: { status: "settled", txHash }, expiresAt: null });
  },

  async release(sessionId) {
    mem.delete(sessionId);
  },
};

function parseRecord(raw: unknown): StoredRecord | null {
  if (typeof raw !== "string") return null;
  try {
    const v = JSON.parse(raw) as StoredRecord;
    return v && (v.status === "pending" || v.status === "settled") ? v : null;
  } catch {
    return null;
  }
}

const hasRedis = Boolean(REDIS_URL && REDIS_TOKEN);

if (!hasRedis && process.env.NODE_ENV === "production") {
  // Loud, not silent: a serverless prod deploy on the memory store can
  // double-settle across instances. Documented in .env.example.
  console.warn(
    "[settlementStore] No KV configured — Stripe settlement idempotency is " +
      "in-memory and NOT safe across instances. Set KV_REST_API_URL / " +
      "KV_REST_API_TOKEN before relying on card→cUSD settlement in production.",
  );
}

export const settlementStore: SettlementStore = hasRedis ? redisStore : memoryStore;
