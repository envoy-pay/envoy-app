import { createPublicClient, http, formatUnits, type PublicClient } from "viem";
import { erc8004, getEnvoyAddresses } from "envoy-pay";
import { getCeloChain } from "./chains";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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

/**
 * Live ERC-20 balance read straight off the Celo RPC. Returns a formatted
 * string (token units) or `null` if the node is unreachable — callers render
 * this as concrete proof the UI is reading on-chain state, not mock data.
 */
export async function getTokenBalance(
  wallet: `0x${string}`,
  token: `0x${string}`,
  decimals: number,
  chainId: number,
): Promise<string | null> {
  try {
    const client = celoClient(chainId);
    const raw = (await client.readContract({
      address: token,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [wallet],
    })) as bigint;
    return formatUnits(raw, decimals);
  } catch {
    return null;
  }
}
