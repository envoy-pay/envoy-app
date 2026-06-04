// Chain IDs inlined (envoy-pay also exports these, but importing the SDK into
// client bundles pulls in a native OWS binary that can't run in the browser).
export const CELO_MAINNET = 42220;
export const CELO_SEPOLIA = 11142220;

export type AssetKey = "cUSD" | "cEUR" | "USDC";

export interface AssetInfo {
  symbol: AssetKey;
  address: `0x${string}`;
  decimals: number;
  label: string;
}

export interface CeloChainInfo {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorer: string;
  assets: Record<AssetKey, AssetInfo>;
}

export const CELO_CHAINS: Record<number, CeloChainInfo> = {
  [CELO_MAINNET]: {
    chainId: CELO_MAINNET,
    name: "Celo Mainnet",
    shortName: "Celo",
    rpcUrl: "https://forno.celo.org",
    explorer: "https://celoscan.io",
    assets: {
      cUSD: {
        symbol: "cUSD",
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        decimals: 18,
        label: "Celo Dollar",
      },
      cEUR: {
        symbol: "cEUR",
        address: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",
        decimals: 18,
        label: "Celo Euro",
      },
      USDC: {
        symbol: "USDC",
        address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        decimals: 6,
        label: "USD Coin",
      },
    },
  },
  [CELO_SEPOLIA]: {
    chainId: CELO_SEPOLIA,
    name: "Celo Sepolia",
    shortName: "Celo Sepolia",
    rpcUrl: "https://forno.celo-sepolia.celo-testnet.org",
    explorer: "https://celo-sepolia.blockscout.com",
    assets: {
      cUSD: {
        symbol: "cUSD",
        address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
        decimals: 18,
        label: "Celo Dollar (testnet)",
      },
      cEUR: {
        symbol: "cEUR",
        address: "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",
        decimals: 18,
        label: "Celo Euro (testnet)",
      },
      USDC: {
        symbol: "USDC",
        address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        decimals: 6,
        label: "USD Coin (testnet)",
      },
    },
  },
};

export function getCeloChain(chainId: number): CeloChainInfo {
  const c = CELO_CHAINS[chainId];
  if (!c) throw new Error(`Unsupported Celo chainId: ${chainId}`);
  return c;
}

export const DEFAULT_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? CELO_MAINNET,
);

// Default agent for the demo flow. #128 is a real ERC-8004 agent registered on
// Celo Mainnet — override with your own once you mint one via /create.
export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID ?? "128";
