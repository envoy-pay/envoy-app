"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  connectWallet,
  discoverWallets,
  getInjectedProvider,
  hasInjectedWallet,
  type DiscoveredWallet,
  type Eip1193Provider,
} from "@/lib/wallet";
import { DEFAULT_CHAIN_ID } from "@/lib/chains";

interface WalletState {
  account: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  available: boolean;
  wallets: DiscoveredWallet[];
  error: string | null;
  connect: (opts?: { chainId?: number; rdns?: string }) => Promise<`0x${string}` | null>;
  disconnect: () => void;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet must be used within <WalletProvider>");
  return c;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  // STATE (not derived) so SSR/first-client render agree → no hydration mismatch.
  const [injected, setInjected] = useState(false);

  const bound = useRef<{
    provider: Eip1193Provider;
    onAccounts: (...a: unknown[]) => void;
    onChain: (...a: unknown[]) => void;
  } | null>(null);

  const available = wallets.length > 0 || injected;

  const detach = useCallback(() => {
    const b = bound.current;
    if (b) {
      b.provider.removeListener?.("accountsChanged", b.onAccounts);
      b.provider.removeListener?.("chainChanged", b.onChain);
    }
    bound.current = null;
  }, []);

  const attach = useCallback(
    (provider: Eip1193Provider) => {
      detach();
      const onAccounts = (...a: unknown[]) =>
        setAccount(((a[0] as string[])?.[0] as `0x${string}`) ?? null);
      const onChain = (...a: unknown[]) => setChainId(parseInt(a[0] as string, 16));
      provider.on?.("accountsChanged", onAccounts);
      provider.on?.("chainChanged", onChain);
      bound.current = { provider, onAccounts, onChain };
    },
    [detach],
  );

  const connect = useCallback(
    async (opts?: { chainId?: number; rdns?: string }) => {
      setError(null);
      setConnecting(true);
      try {
        const cid = opts?.chainId ?? DEFAULT_CHAIN_ID;
        let provider: Eip1193Provider | undefined;
        if (opts?.rdns) provider = wallets.find((w) => w.rdns === opts.rdns)?.provider;
        if (!provider && wallets.length === 1) provider = wallets[0].provider;
        const c = await connectWallet(cid, provider);
        setAccount(c.account);
        setChainId(c.chainId);
        const used = provider ?? getInjectedProvider();
        if (used) attach(used);
        return c.account;
      } catch (err: unknown) {
        setError(
          (err as { shortMessage?: string })?.shortMessage ??
            (err as Error)?.message ??
            "Could not connect.",
        );
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [wallets, attach],
  );

  const disconnect = useCallback(() => {
    detach();
    setAccount(null);
    setChainId(null);
  }, [detach]);

  // Discover EIP-6963 wallets + detect injected fallback (incl. late injection)
  // + silently restore an existing connection.
  useEffect(() => {
    const stop = discoverWallets(setWallets);
    let cancelled = false;

    const detect = (): boolean => {
      if (cancelled || !hasInjectedWallet()) return false;
      setInjected(true);
      const eth = getInjectedProvider()!;
      eth
        .request({ method: "eth_accounts" })
        .then((a) => {
          const accs = a as string[];
          if (!cancelled && accs?.[0]) {
            setAccount(accs[0] as `0x${string}`);
            if (!bound.current) attach(eth);
          }
        })
        .catch(() => {});
      eth
        .request({ method: "eth_chainId" })
        .then((id) => {
          if (!cancelled) setChainId(parseInt(id as string, 16));
        })
        .catch(() => {});
      return true;
    };

    const onInit = () => detect();
    if (!detect()) window.addEventListener("ethereum#initialized", onInit, { once: true });
    const t1 = setTimeout(detect, 400);
    const t2 = setTimeout(detect, 1500);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener("ethereum#initialized", onInit);
      clearTimeout(t1);
      clearTimeout(t2);
      detach();
    };
  }, [attach, detach]);

  return (
    <Ctx.Provider
      value={{ account, chainId, connecting, available, wallets, error, connect, disconnect }}
    >
      {children}
    </Ctx.Provider>
  );
}
