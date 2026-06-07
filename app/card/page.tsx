"use client";

import { useEffect, useState } from "react";
import { Masthead } from "@/app/_components/Masthead";
import { useWallet } from "@/app/_components/WalletProvider";
import { CELO_MAINNET, DEFAULT_AGENT_ID } from "@/lib/chains";

const CHAIN_ID = CELO_MAINNET;

interface IssuedCard {
  id: string;
  last4?: string;
  brand?: string;
  status: string;
}

export default function CardPage() {
  const { account } = useWallet();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<{ agentId: string; agentWallet: string; walletTail: string }[]>([]);
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [agentWallet, setAgentWallet] = useState<string | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [perAuth, setPerAuth] = useState("50");
  const [daily, setDaily] = useState("200");

  const [provisioning, setProvisioning] = useState(false);
  const [card, setCard] = useState<IssuedCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingControls, setSavingControls] = useState(false);
  const [controlsMsg, setControlsMsg] = useState<string | null>(null);

  // Is Stripe Issuing wired on the server?
  useEffect(() => {
    let live = true;
    fetch("/api/card/status")
      .then((r) => r.json())
      .then((d) => live && setConfigured(Boolean(d?.configured)))
      .catch(() => live && setConfigured(false));
    return () => {
      live = false;
    };
  }, []);

  // Suggest the connected wallet's agents.
  useEffect(() => {
    if (!account) {
      setAgents([]);
      return;
    }
    let live = true;
    fetch(`/api/agents?owner=${account}&chain=${CHAIN_ID}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        const list = Array.isArray(d?.agents) ? d.agents : [];
        setAgents(list);
        if (list.length) {
          setAgentId((cur) => (list.some((a: { agentId: string }) => a.agentId === cur) ? cur : list[0].agentId));
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [account]);

  // Resolve the agent's signing wallet (the card's funding wallet).
  useEffect(() => {
    const id = agentId.trim();
    if (!/^\d+$/.test(id)) {
      setAgentWallet(null);
      return;
    }
    let live = true;
    setWalletLoading(true);
    fetch(`/api/agent/${id}?chain=${CHAIN_ID}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setAgentWallet(d?.agentWallet ?? null))
      .catch(() => live && setAgentWallet(null))
      .finally(() => live && setWalletLoading(false));
    return () => {
      live = false;
    };
  }, [agentId]);

  async function provision() {
    setError(null);
    setCard(null);
    if (!agentWallet) {
      setError("Pick an agent with a signing wallet first.");
      return;
    }
    setProvisioning(true);
    try {
      const res = await fetch("/api/card/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId: agentId.trim(), walletAddress: agentWallet, perAuthorization: perAuth, daily }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Provisioning failed.");
      setCard(data as IssuedCard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provisioning failed.");
    } finally {
      setProvisioning(false);
    }
  }

  async function saveControls() {
    if (!card) return;
    setControlsMsg(null);
    setSavingControls(true);
    try {
      const res = await fetch("/api/card/controls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, perAuthorization: perAuth, daily }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Update failed.");
      setControlsMsg("controls updated ✓");
    } catch (e) {
      setControlsMsg(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSavingControls(false);
    }
  }

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[620px] px-6 pb-28 pt-16">
        <span className="small-caps text-ink-mute">spend · virtual card</span>
        <h1 className="mt-3 font-display text-[clamp(30px,4.5vw,46px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
          Give your agent a card.
        </h1>
        <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-ink-soft">
          A stablecoin-backed virtual card, linked to the agent&apos;s wallet and funded
          from its cUSD. It lets the agent pay anything that takes a card — subscriptions,
          domains, SaaS — within limits you set, on top of its on-chain policy.
        </p>

        <div className="glass mt-7 rounded-[22px] p-5 md:p-6">
          {configured === false && (
            <p className="mb-4 rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              Stripe Issuing isn&apos;t configured on this server — set STRIPE_SECRET_KEY (and
              enable Issuing on the account) to provision cards. Stablecoin cards are in
              private preview via Bridge.
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="small-caps text-ink-faint">agent</p>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 font-mono text-[10px] text-ink-faint sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-silver" />
              Celo · cUSD
            </span>
          </div>
          <div className="mt-2">
            <input
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agent id — type it, or pick a suggestion"
              inputMode="numeric"
              list={account && agents.length > 0 ? "my-agents" : undefined}
              className="field"
            />
            {account && agents.length > 0 && (
              <datalist id="my-agents">
                {agents.map((a) => (
                  <option key={a.agentId} value={a.agentId}>
                    0x…{a.walletTail}
                  </option>
                ))}
              </datalist>
            )}
            <p className="mt-1.5 font-mono text-[10px] text-ink-faint">
              {walletLoading
                ? "resolving signing wallet…"
                : agentWallet
                  ? `funds from ${agentWallet.slice(0, 6)}…${agentWallet.slice(-4)}`
                  : "enter a registered agent id"}
            </p>
          </div>

          <p className="mt-5 small-caps text-ink-faint">spending controls</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] text-ink-faint">max / authorization · usd</span>
              <input value={perAuth} onChange={(e) => setPerAuth(e.target.value)} className="field mt-1" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-ink-faint">daily cap · usd</span>
              <input value={daily} onChange={(e) => setDaily(e.target.value)} className="field mt-1" />
            </label>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-faint">
            enforced at the card network · the agent&apos;s on-chain policy still caps what
            Bridge can pull from its wallet
          </p>

          <button
            onClick={provision}
            disabled={provisioning || !agentWallet || configured === false}
            className="pill-dark mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold text-slate-text disabled:opacity-60"
          >
            {provisioning ? "Provisioning…" : "Provision card"}
            {!provisioning && <span className="font-mono text-xs">↗</span>}
          </button>

          {error && (
            <p className="mt-3 rounded-xl border border-ink/10 bg-paper-dim/60 px-4 py-3 text-[13px] text-ink-soft">
              {error}
            </p>
          )}
        </div>

        {card && (
          <div className="mt-4">
            <div
              className="relative overflow-hidden rounded-[22px] p-6 shadow-[0_44px_110px_-40px_rgba(20,21,26,0.55)]"
              style={{ background: "linear-gradient(155deg, #1b1d24 0%, #101117 46%, #08090d 100%)" }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="flag text-slate-mute">virtual card</p>
                  <p className="mt-1.5 font-display text-[15px] font-extrabold tracking-tight text-slate-text">envoy</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-silver" />
                  <span className="small-caps text-slate-mute">{card.status}</span>
                </span>
              </div>
              <p className="mt-8 font-mono text-[clamp(15px,2.4vw,20px)] tracking-[0.12em] text-slate-text/90">
                •••• •••• •••• {card.last4 ?? "••••"}
              </p>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="flag text-slate-mute">agent</p>
                  <p className="mt-1 font-mono text-sm text-slate-text">#{agentId}</p>
                </div>
                <div className="text-right">
                  <p className="flag text-slate-mute">network</p>
                  <p className="mt-1 font-mono text-sm text-slate-text">{card.brand ?? "Visa"}</p>
                </div>
              </div>
            </div>

            <div className="glass mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
              <p className="font-mono text-[11px] text-ink-mute">
                limits: {perAuth} / auth · {daily} / day
              </p>
              <button
                onClick={saveControls}
                disabled={savingControls}
                className="pill inline-flex items-center rounded-full px-4 py-2 text-[13px] font-medium text-ink disabled:opacity-60"
              >
                {savingControls ? "Saving…" : "Update controls"}
              </button>
            </div>
            {controlsMsg && (
              <p className="mt-2 text-center font-mono text-[11px] text-ink-mute">{controlsMsg}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-center font-mono text-[10px] text-ink-faint">
          stablecoin-backed virtual card · Stripe Issuing · funded from the agent&apos;s cUSD
        </p>
      </main>
    </>
  );
}
