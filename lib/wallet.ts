"use client";

/**
 * Minimal injected-wallet connector (MetaMask / Valora / any EIP-1193 provider)
 * built directly on viem — no wagmi, no SDK. Returns a walletClient + publicClient
 * pinned to the requested Celo chain, switching/adding the network if needed.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
} from "viem";
import { celo, celoSepolia } from "viem/chains";
import { getCeloChain } from "./chains";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

// We deliberately do NOT `declare global { interface Window { ethereum } }`:
// a transitive dep (@turnkey/wallet-stamper → viem/window) already augments it
// with viem's stricter EIP1193Provider, and a second declaration collides.
// Reading it through this cast keeps our own minimal provider type at call sites
// without depending on whose global augmentation wins.
export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
}

function viemChain(chainId: number) {
  if (chainId === celo.id) return celo;
  if (chainId === celoSepolia.id) return celoSepolia;
  throw new Error(`Unsupported chainId ${chainId}`);
}

export function hasInjectedWallet(): boolean {
  return Boolean(getInjectedProvider());
}

// ── EIP-6963: multi-wallet discovery ─────────────────────────────────────────
// Wallets announce themselves instead of racing to own `window.ethereum`, which
// avoids the "Cannot set property ethereum" conflict when several are installed.
export interface DiscoveredWallet {
  rdns: string;
  name: string;
  icon: string;
  provider: Eip1193Provider;
}

export function discoverWallets(
  onChange: (wallets: DiscoveredWallet[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const map = new Map<string, DiscoveredWallet>();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as
      | { info?: { rdns?: string; name?: string; icon?: string }; provider?: Eip1193Provider }
      | undefined;
    if (!detail?.info?.rdns || !detail.provider) return;
    map.set(detail.info.rdns, {
      rdns: detail.info.rdns,
      name: detail.info.name ?? detail.info.rdns,
      icon: detail.info.icon ?? "",
      provider: detail.provider,
    });
    onChange([...map.values()]);
  };
  window.addEventListener("eip6963:announceProvider", handler as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () =>
    window.removeEventListener("eip6963:announceProvider", handler as EventListener);
}

export async function connectWallet(chainId: number, injected?: Eip1193Provider) {
  const provider = injected ?? getInjectedProvider();
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask or Valora.");
  }

  const chain = viemChain(chainId);
  const info = getCeloChain(chainId);
  const hexId = `0x${chainId.toString(16)}`;

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as Address[];
  const account = accounts?.[0];
  if (!account) throw new Error("Wallet returned no account.");

  // Ensure the wallet is on the right Celo chain (switch, adding it if unknown).
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: info.name,
            nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
            rpcUrls: [info.rpcUrl],
            blockExplorerUrls: [info.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(provider),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(info.rpcUrl),
  });

  return { account, chainId, walletClient, publicClient };
}
