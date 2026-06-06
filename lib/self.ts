// Self Agent ID — proof-of-human via passport ZK-proof, bound to an agent on Celo.
//
// Self Agent ID is a Proof-of-Human extension of ERC-8004: a soulbound NFT that
// ties an agent identity to a real human's passport, verified in zero-knowledge
// (nothing leaves the owner's phone). It's a SEPARATE registry from the canonical
// ERC-8004 one /create mints into — same idea, different address.
//
// The whole registration flow is plain REST against Self's hosted API, so we proxy
// it through two thin Node routes (no SDK, no secrets, no client-side CORS coupling).
// Pure constants/helpers live here so both the routes and the client component share
// one source of truth.

export const CELO_MAINNET = 42220;
export const CELO_SEPOLIA = 11142220;

export type SelfNetwork = "mainnet" | "testnet";

/** Self's canonical base. self-agent-id.vercel.app 307-redirects here; use it directly. */
export const SELF_API_BASE =
  (typeof process !== "undefined" ? process.env.SELF_AGENT_API_BASE : undefined) ??
  "https://app.ai.self.xyz";

export function selfNetworkForChain(chainId: number): SelfNetwork {
  return chainId === CELO_MAINNET ? "mainnet" : "testnet";
}

/** SelfAgentRegistry addresses (distinct from the canonical ERC-8004 registry). */
export const SELF_REGISTRY: Record<SelfNetwork, `0x${string}`> = {
  mainnet: "0xaC3DF9ABf80d0F5c020C06B04Cced27763355944",
  testnet: "0x043DaCac8b0771DD5b444bCC88f2f8BBDBEdd379",
};

export function selfExplorerBase(network: SelfNetwork): string {
  return network === "mainnet"
    ? "https://celoscan.io"
    : "https://celo-sepolia.blockscout.com";
}

/** Disclosure gates the human's proof can attest to (map to a config index on-chain). */
export interface SelfDisclosures {
  minimumAge?: 18 | 21;
  ofac?: boolean;
}

/** Fields the client needs to drive the scan + poll loop. Mirrors the hosted API. */
export interface SelfRegisterResponse {
  sessionToken: string;
  stage: string;
  deepLink: string;
  scanUrl?: string;
  qrImageBase64?: string;
  agentAddress: `0x${string}`;
  expiresAt: string;
  timeRemainingMs: number;
  humanInstructions: string[];
  network: SelfNetwork;
}

/** Status of a pending registration, polled with the rolling session token. */
export interface SelfStatusResponse {
  stage: string; // "qr-ready" | "pending" | "completed" | "failed" | "expired" | …
  sessionToken: string;
  agentId?: number;
  agentAddress?: `0x${string}`;
  txHash?: string;
}
