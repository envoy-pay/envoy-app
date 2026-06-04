/**
 * Client-safe Envoy contract addresses (mirrors `src/contracts/addresses.ts`).
 * Vendored so client bundles never import the SDK. Verified live on Celo Mainnet.
 */
import { CELO_MAINNET, CELO_SEPOLIA } from "./chains";

export interface EnvoyAddresses {
  facilitator: `0x${string}`;
  identityRegistry: `0x${string}`;
  reputationRegistry: `0x${string}`;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const ENVOY_ADDRESSES: Record<number, EnvoyAddresses> = {
  [CELO_MAINNET]: {
    facilitator: "0xE268B6fE16319b49D22562C93c0d2395F65FCAcC",
    identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
  },
  [CELO_SEPOLIA]: {
    facilitator: ZERO,
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
};

export function getEnvoyAddresses(chainId: number): EnvoyAddresses {
  const a = ENVOY_ADDRESSES[chainId];
  if (!a) throw new Error(`Envoy not configured for chainId ${chainId}`);
  return a;
}
