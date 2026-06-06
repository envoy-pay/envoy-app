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

// Remember the wallet the user last connected through so a refresh can silently
// re-attach to the SAME extension (by EIP-6963 rdns) instead of guessing at
// window.ethereum — which may be a different wallet entirely. We only reconnect
// when this marker exists, so we never surprise-connect a first-time visitor.
const STORAGE_KEY = "envoy.wallet.v1";

interface Persisted {
  /** rdns of the EIP-6963 wallet chosen; absent for the bare injected fallback. */
  rdns?: string;
}

function readPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function writePersisted(p: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* private mode / storage disabled — the session just won't survive a refresh */
  }
}

function clearPersisted(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

interface WalletState {
  account: `0x${string}` | null;
  chainId: number | null;
  connecting: boolean;
  /** True only while we're silently restoring a remembered connection on load,
   *  so the UI can wait instead of flashing a "connect" button. */
  reconnecting: boolean;
  available: boolean;
  wallets: DiscoveredWallet[];
  error: string | null;
  /** The EIP-1193 provider actually in use (the wallet the user picked). Sign
   *  through THIS, not raw window.ethereum — several extensions collide there. */
  provider: Eip1193Provider | null;
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
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  // The provider we actually transact through — the wallet the user picked via
  // EIP-6963, not whatever last grabbed window.ethereum.
  const [activeProvider, setActiveProvider] = useState<Eip1193Provider | null>(null);
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

  // Tear down the live session WITHOUT forgetting the user's choice — used when
  // the wallet itself reports zero accounts (locked / disconnected from its UI).
  const clearSession = useCallback(() => {
    detach();
    setAccount(null);
    setChainId(null);
    setActiveProvider(null);
  }, [detach]);

  const attach = useCallback(
    (provider: Eip1193Provider) => {
      detach();
      const onAccounts = (...a: unknown[]) => {
        const next = (a[0] as string[])?.[0] as `0x${string}` | undefined;
        if (next) {
          setAccount(next);
        } else {
          // Disconnected from the wallet side → make it a real disconnect so we
          // don't keep trying to silently reconnect to a revoked session.
          clearPersisted();
          clearSession();
        }
      };
      const onChain = (...a: unknown[]) => setChainId(parseInt(a[0] as string, 16));
      provider.on?.("accountsChanged", onAccounts);
      provider.on?.("chainChanged", onChain);
      bound.current = { provider, onAccounts, onChain };
    },
    [detach, clearSession],
  );

  const connect = useCallback(
    async (opts?: { chainId?: number; rdns?: string }) => {
      setError(null);
      setConnecting(true);
      try {
        const cid = opts?.chainId ?? DEFAULT_CHAIN_ID;
        let provider: Eip1193Provider | undefined;
        let rdns = opts?.rdns;
        if (rdns) provider = wallets.find((w) => w.rdns === rdns)?.provider;
        if (!provider && wallets.length === 1) {
          provider = wallets[0].provider;
          rdns = wallets[0].rdns;
        }
        const c = await connectWallet(cid, provider);
        setAccount(c.account);
        setChainId(c.chainId);
        const used = provider ?? getInjectedProvider();
        if (used) attach(used);
        setActiveProvider(used ?? null);
        // Remember the choice so a refresh re-attaches to the same wallet.
        writePersisted(rdns ? { rdns } : {});
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
    clearPersisted();
    clearSession();
  }, [clearSession]);

  // ── Discover EIP-6963 wallets + detect an injected fallback (incl. late
  //    injection). Pure detection — restoring a session lives in the effect below.
  useEffect(() => {
    const stop = discoverWallets(setWallets);
    let cancelled = false;

    const detect = (): boolean => {
      if (cancelled || !hasInjectedWallet()) return false;
      setInjected(true);
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
  }, [detach]);

  // ── Silently restore a remembered connection. Re-runs as wallets are
  //    discovered / injection lands, so we wait for the EXACT wallet the user
  //    picked rather than racing window.ethereum. eth_accounts never prompts, so
  //    this is invisible; it's a complete no-op when nothing was saved.
  useEffect(() => {
    if (account) {
      setReconnecting(false);
      return;
    }
    const persisted = readPersisted();
    if (!persisted) {
      setReconnecting(false);
      return;
    }

    // Resolve the specific provider the user last used.
    let provider: Eip1193Provider | undefined;
    if (persisted.rdns) provider = wallets.find((w) => w.rdns === persisted.rdns)?.provider;
    else provider = getInjectedProvider();

    // Chosen wallet hasn't announced yet — keep waiting (a later discovery /
    // injection re-runs this effect). The give-up timer below stops the spinner.
    if (!provider) {
      setReconnecting(true);
      return;
    }

    setReconnecting(true);
    let cancelled = false;
    const chosen = provider;
    chosen
      .request({ method: "eth_accounts" })
      .then((a) => {
        if (cancelled) return;
        const accs = a as string[];
        if (accs?.[0]) {
          setAccount(accs[0] as `0x${string}`);
          setActiveProvider(chosen);
          attach(chosen);
          chosen
            .request({ method: "eth_chainId" })
            .then((id) => {
              if (!cancelled) setChainId(parseInt(id as string, 16));
            })
            .catch(() => {});
        } else {
          // Wallet is present but no longer authorizes us → forget the stale pick.
          clearPersisted();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReconnecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wallets, injected, account, attach]);

  // Stop showing the reconnecting state if the saved wallet never shows up
  // (e.g. opened in a profile where that extension isn't installed).
  useEffect(() => {
    if (!readPersisted()) return;
    const t = setTimeout(() => setReconnecting(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Ctx.Provider
      value={{
        account,
        chainId,
        connecting,
        reconnecting,
        available,
        wallets,
        error,
        provider: activeProvider,
        connect,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
