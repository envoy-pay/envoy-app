import { createPublicClient, http, type PublicClient } from "viem";
import { erc8004, getEnvoyAddresses } from "envoy-pay";
import { getCeloChain } from "./chains";

export interface ResolvedAgent {
  agentId: string;
  agentWallet: `0x${string}`;
  owner: `0x${string}`;
  tokenURI: string;
  chainId: number;
  source: "registry" | "demo";
}

const DEMO_AGENTS: Record<string, Omit<ResolvedAgent, "source">> = {
  demo: {
    agentId: "demo",
    agentWallet: "0x000000000000000000000000000000000000dEaD",
    owner: "0x000000000000000000000000000000000000bEEF",
    tokenURI: "https://envoy.dev/agents/demo.json",
    chainId: 42220,
  },
};

function celoClient(chainId: number): PublicClient {
  const chain = getCeloChain(chainId);
  return createPublicClient({
    transport: http(chain.rpcUrl),
  });
}

export async function resolveAgent(
  agentIdRaw: string,
  chainId: number,
): Promise<ResolvedAgent> {
  const numeric = /^\d+$/.test(agentIdRaw) ? BigInt(agentIdRaw) : null;
  if (numeric === null) {
    const demo = DEMO_AGENTS[agentIdRaw];
    if (demo) return { ...demo, source: "demo" };
    throw new Error(`agentId must be numeric or a known demo handle (got "${agentIdRaw}")`);
  }

  const { identityRegistry } = getEnvoyAddresses(chainId);
  const client = celoClient(chainId);
  const agent = await erc8004.getAgent(client, identityRegistry, numeric);

  return {
    agentId: numeric.toString(),
    agentWallet: agent.agentWallet,
    owner: agent.owner,
    tokenURI: agent.tokenURI,
    chainId,
    source: "registry",
  };
}
