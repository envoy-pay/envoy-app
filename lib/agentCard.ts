/**
 * Agent card (ERC-8004 tokenURI metadata) — client-safe.
 *
 * Vendored into the web app the same way `lib/abi.ts` vendors the SDK's ABIs:
 * the `/create` page is a client component and can't import `envoy-pay` (it pulls
 * a native binary). This is the single source of truth used by both `/create`
 * (build + encode) and the fund page (decode + render).
 *
 * Phase 1 primary path: the card is stored fully on-chain as a
 * `data:application/json;base64,…` tokenURI — durable and self-verifying (the
 * chain holds the bytes). Remote `ipfs://`/`https://` cards are recognized but
 * NOT fetched here (that guarded fetch + hash-verify is Phase 2 / BYO mode).
 *
 * Schema mirrors `AgentCardData` and the validation in `src/identity/agent-card.ts`.
 */
import { keccak256 } from "viem";

export interface AgentCardData {
  name: string;
  version: string;
  description?: string;
  capabilities: string[];
  owner: string;
  endpoints?: {
    a2a?: string;
    mcp?: string;
    payment?: string;
    webhook?: string;
  };
  addresses?: Array<{ chain: string; caip2Id: string; address: string }>;
  iconUrl?: string;
  tags?: string[];
}

/** Mirrors `AgentCard.validateCard` in the SDK — throws on an invalid card. */
export function validateCard(data: AgentCardData): void {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error("Agent name is required.");
  }
  if (!data.version || !/^\d+\.\d+\.\d+/.test(data.version)) {
    throw new Error('Version must be semver (e.g. "1.0.0").');
  }
  if (!data.capabilities || data.capabilities.length === 0) {
    throw new Error("Add at least one capability.");
  }
  if (!data.owner || data.owner.trim().length === 0) {
    throw new Error("Owner address is required.");
  }
}

/**
 * Deterministic JSON: object keys sorted recursively, array order preserved,
 * `undefined` dropped. The same logical card always serializes (and hashes)
 * identically — the single source of bytes for the data: URI and the hash.
 */
export function toCanonicalJSON(card: AgentCardData): string {
  return JSON.stringify(canonicalize(card));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** Encode a validated card as a `data:application/json;base64,…` tokenURI. */
export function encodeDataURI(card: AgentCardData): string {
  validateCard(card);
  const json = toCanonicalJSON(card);
  return `data:application/json;base64,${bytesToBase64(new TextEncoder().encode(json))}`;
}

/** keccak256 of the canonical card bytes — the integrity anchor (used in Phase 2). */
export function cardHash(card: AgentCardData): `0x${string}` {
  return keccak256(new TextEncoder().encode(toCanonicalJSON(card)));
}

/** Byte length of the resulting data: URI — for the live "on-chain size" preview.
 *  Does not validate, so it works on a partially-filled card. */
export function dataUriSize(card: AgentCardData): number {
  const json = toCanonicalJSON(card);
  return `data:application/json;base64,${bytesToBase64(new TextEncoder().encode(json))}`.length;
}

export interface ParsedCard {
  card: AgentCardData | null;
  source: "data" | "ipfs" | "https" | "none";
  /** true only for on-chain `data:` cards — the chain holds the bytes. */
  verified: boolean;
  /** for remote cards: a browser-openable link (not fetched in Phase 1). */
  remoteUrl?: string;
}

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const MAX_DATA_URI = 100_000; // guard against absurd on-chain payloads

/**
 * Read a tokenURI into a card. `data:` is decoded offline (no network). Remote
 * schemes are recognized and linked, but deliberately NOT fetched here — the
 * guarded, hash-verified fetch lands in Phase 2.
 */
export function parseAgentCard(tokenURI: string | null | undefined): ParsedCard {
  const uri = tokenURI?.trim();
  if (!uri) return { card: null, source: "none", verified: false };

  if (uri.startsWith("data:")) {
    try {
      if (uri.length > MAX_DATA_URI) throw new Error("data uri too large");
      return { card: decodeDataURI(uri), source: "data", verified: true };
    } catch {
      return { card: null, source: "data", verified: false };
    }
  }
  if (uri.startsWith("ipfs://")) {
    return { card: null, source: "ipfs", verified: false, remoteUrl: IPFS_GATEWAY + uri.slice(7) };
  }
  if (uri.startsWith("https://")) {
    return { card: null, source: "https", verified: false, remoteUrl: uri };
  }
  return { card: null, source: "none", verified: false };
}

function decodeDataURI(uri: string): AgentCardData {
  const comma = uri.indexOf(",");
  if (comma < 0) throw new Error("malformed data uri");
  const meta = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const json = /;base64/i.test(meta)
    ? new TextDecoder().decode(base64ToBytes(payload))
    : decodeURIComponent(payload);
  const obj = JSON.parse(json);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("card is not a JSON object");
  }
  return coerceCard(obj as Record<string, unknown>);
}

/**
 * Coerce an arbitrary decoded object into a strictly-typed card. The tokenURI is
 * attacker-controlled, so we never trust its shape: non-string fields are dropped
 * (a `{"name": {}}` must not reach JSX as an object child and crash the render).
 */
function coerceCard(o: Record<string, unknown>): AgentCardData {
  const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const card: AgentCardData = {
    name: str(o.name) ?? "",
    version: str(o.version) ?? "",
    capabilities: strArr(o.capabilities),
    owner: str(o.owner) ?? "",
  };
  if (str(o.description)) card.description = str(o.description);
  if (str(o.iconUrl)) card.iconUrl = str(o.iconUrl);
  if (strArr(o.tags).length) card.tags = strArr(o.tags);

  if (o.endpoints && typeof o.endpoints === "object" && !Array.isArray(o.endpoints)) {
    const e = o.endpoints as Record<string, unknown>;
    const ep: NonNullable<AgentCardData["endpoints"]> = {};
    for (const k of ["a2a", "mcp", "payment", "webhook"] as const) {
      const v = str(e[k]);
      if (v) ep[k] = v;
    }
    if (Object.keys(ep).length) card.endpoints = ep;
  }

  if (Array.isArray(o.addresses)) {
    const addrs = o.addresses.flatMap((a) => {
      if (!a || typeof a !== "object") return [];
      const ao = a as Record<string, unknown>;
      const chain = str(ao.chain);
      const caip2Id = str(ao.caip2Id);
      const address = str(ao.address);
      return chain && caip2Id && address ? [{ chain, caip2Id, address }] : [];
    });
    if (addrs.length) card.addresses = addrs;
  }

  return card;
}

// ── UTF-8-safe base64 (btoa is Latin-1 only; feed it a byte string) ──────────
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
