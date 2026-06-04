import QRCode from "qrcode";
import { buildEip681Uri } from "envoy-pay";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { resolveAgent, getTokenBalance } from "@/lib/registry";
import { parseAgentCard, type ParsedCard } from "@/lib/agentCard";
import { shortAddress } from "@/lib/format";
import { Masthead } from "@/app/_components/Masthead";
import { Reveal } from "@/app/_components/motion";
import { WatcherBanner } from "./WatcherBanner";
import { QrReveal } from "./QrReveal";

interface PageProps {
  params: { agentId: string };
  searchParams: { amount?: string; asset?: string; chain?: string; paid?: string };
}

const STRIPE_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY);

export default async function FundPage({ params, searchParams }: PageProps) {
  const chainId = searchParams.chain ? Number(searchParams.chain) : DEFAULT_CHAIN_ID;
  const asset = (searchParams.asset as AssetKey) ?? "cUSD";
  const amount = searchParams.amount ?? "1";

  const chain = getCeloChain(chainId);
  const assetInfo = chain.assets[asset];
  if (!assetInfo) throw new Error(`Unsupported asset: ${asset}`);

  const agent = await resolveAgent(params.agentId, chainId);
  const isNumericId = /^\d+$/.test(String(agent.agentId));
  const card = parseAgentCard(agent.tokenURI);

  // Live, on-chain balance for the agent's signing wallet — read at request time.
  const liveBalance = await getTokenBalance(
    agent.agentWallet,
    assetInfo.address,
    assetInfo.decimals,
    chainId,
  );
  const liveBalanceLabel =
    liveBalance === null
      ? "rpc unreachable"
      : `${Number(liveBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${asset}`;

  const eip681 = buildEip681Uri({
    to: agent.agentWallet,
    amount,
    asset: assetInfo.address,
    chainId,
    decimals: assetInfo.decimals,
  });
  const qrSvg = await QRCode.toString(eip681, {
    type: "svg",
    margin: 1,
    width: 320,
    color: { dark: "#16171A", light: "#FBFBFA" },
  });

  return (
    <>
      <Masthead rightSlot={<ChainBadge chainShort={chain.shortName} chainId={chainId} />} />

      <main className="mx-auto max-w-[760px] px-6 pb-28 pt-14">
        {/* header */}
        <Reveal className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-bright/50 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
            <span className="small-caps text-ink-mute">
              {agent.source === "registry" ? "ERC-8004 agent" : "demo agent"}
            </span>
          </span>
          <h1 className="mt-6 font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink md:text-[58px]">
            Fund agent{" "}
            <span className="text-ink-mute">
              {isNumericId ? `№${agent.agentId}` : agent.agentId}
            </span>
          </h1>
          <p className="mt-4 font-mono text-sm text-ink-mute">
            {amount} {asset} → {shortAddress(agent.agentWallet)} · {chain.shortName}
          </p>
          <a
            href={`${chain.explorer}/address/${agent.agentWallet}`}
            target="_blank"
            rel="noreferrer"
            className="group mt-5 inline-flex items-center gap-2.5 rounded-full border border-ink/10 bg-paper-bright/50 py-1.5 pl-2.5 pr-3.5 transition-colors hover:border-ink/20"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-mute/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-soft" />
            </span>
            <span className="small-caps text-ink-mute">live balance</span>
            <span className="font-mono text-[13px] text-ink">{liveBalanceLabel}</span>
            <span className="font-mono text-[11px] text-ink-faint transition-transform group-hover:translate-x-0.5">
              celoscan ↗
            </span>
          </a>
        </Reveal>

        {(card.card || card.remoteUrl) && (
          <Reveal delay={0.05} className="mx-auto mt-8 max-w-[560px]">
            <AgentCardPanel parsed={card} />
          </Reveal>
        )}

        {searchParams.paid && (
          <Reveal delay={0.05} className="mt-8">
            <div className="glass-hot rounded-2xl px-6 py-4 text-center">
              <p className="small-caps text-ink">
                card captured · {searchParams.paid.slice(0, 16)}…
              </p>
              <p className="mt-1 font-mono text-xs text-ink-mute">
                cUSD settling to {shortAddress(agent.agentWallet)} — watch the live
                balance &amp; watcher below
              </p>
            </div>
          </Reveal>
        )}

        {/* payment panel — QR + rails grouped as one object */}
        <Reveal delay={0.1} className="mt-10">
          <div className="glass mx-auto max-w-[680px] rounded-[28px] p-5 md:p-7">
            <div className="grid items-stretch gap-7 md:grid-cols-[200px_1fr] md:gap-8">
              {/* left — scan */}
              <div className="flex flex-col items-center gap-3">
                <QrReveal svg={qrSvg} />
                <p className="small-caps text-ink-mute">scan to fund</p>
              </div>

              {/* right — tap a rail */}
              <div className="flex flex-col justify-center md:border-l md:border-ink/[0.08] md:pl-8">
                <p className="small-caps text-ink-faint">or pay another way</p>
                <div className="mt-3 flex flex-col gap-3">
                  <Rail label="Open in Celo wallet" hint="Valora · Rainbow · MetaMask" href={eip681} primary />
                  {STRIPE_ENABLED ? (
                    <form action={`/api/checkout/${params.agentId}?amount=${amount}&asset=${asset}&chain=${chainId}`} method="POST">
                      <RailSubmit label="Pay with card · Stripe" hint="Treasury settles cUSD on capture" />
                    </form>
                  ) : (
                    <Rail label="Pay with card · Stripe" hint="Disabled · set STRIPE_SECRET_KEY" href="#" disabled />
                  )}
                </div>
                <p className="mt-4 font-mono text-[11px] text-ink-faint">
                  any celo wallet · {asset} · chain {chainId} · settles in cUSD
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* watcher */}
        <Reveal delay={0.1} className="mt-12">
          <WatcherBanner
            wallet={agent.agentWallet}
            chainId={chainId}
            asset={asset}
            chainShortName={chain.shortName}
            explorer={chain.explorer}
          />
        </Reveal>

        {/* record */}
        <Reveal delay={0.1} className="mt-12">
          <p className="mb-4 text-center small-caps text-ink-mute">agent record</p>
          <dl className="glass grid grid-cols-1 gap-px overflow-hidden rounded-2xl sm:grid-cols-2">
            <Cell k="Agent ID" v={`#${agent.agentId}`} />
            <Cell k="Live balance" v={liveBalanceLabel} mono />
            <Cell
              k="Owner"
              v={shortAddress(agent.owner, 8, 6)}
              mono
              href={`${chain.explorer}/address/${agent.owner}`}
            />
            <Cell
              k="Signing wallet"
              v={shortAddress(agent.agentWallet, 8, 6)}
              mono
              href={`${chain.explorer}/address/${agent.agentWallet}`}
            />
            <Cell k="Asset" v={`${assetInfo.label} (${asset})`} />
            <Cell
              k="Token"
              v={shortAddress(assetInfo.address, 8, 6)}
              mono
              href={`${chain.explorer}/token/${assetInfo.address}`}
            />
          </dl>
          <div className="mt-4 rounded-xl border border-ink/[0.07] bg-paper-bright/40 px-4 py-3">
            <p className="flag mb-1.5 text-center text-ink-faint">eip-681 payment uri</p>
            <p className="break-all text-center font-mono text-[11px] leading-relaxed text-ink-faint">
              {eip681}
            </p>
          </div>
        </Reveal>
      </main>
    </>
  );
}

/**
 * The agent's self-described card (name, capabilities, endpoints). These are
 * descriptive claims — the authoritative owner / signing wallet come only from
 * the on-chain reads shown in the Agent Record, never from the card.
 */
function AgentCardPanel({ parsed }: { parsed: ParsedCard }) {
  if (!parsed.card) {
    if (!parsed.remoteUrl) return null;
    return (
      <a
        href={parsed.remoteUrl}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center justify-center gap-2.5 rounded-2xl border border-ink/10 bg-paper-bright/50 px-5 py-3 transition-colors hover:border-ink/20"
      >
        <span className="small-caps text-ink-mute">agent card</span>
        <span className="font-mono text-[12px] text-ink-soft">hosted off-chain ({parsed.source})</span>
        <span className="font-mono text-[11px] text-ink-faint transition-transform group-hover:translate-x-0.5">
          view ↗
        </span>
      </a>
    );
  }

  const c = parsed.card;
  const endpoints = c.endpoints
    ? Object.entries(c.endpoints).filter(([, v]) => Boolean(v))
    : [];

  return (
    <div className="glass rounded-2xl px-6 py-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className="font-display text-lg font-bold tracking-tight text-ink">{c.name}</p>
          {c.version && (
            <span className="font-mono text-[11px] text-ink-faint">v{c.version}</span>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-paper-bright/60 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
          <span className="small-caps text-ink-mute">on-chain · verified</span>
        </span>
      </div>

      {c.description && (
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{c.description}</p>
      )}

      {Array.isArray(c.capabilities) && c.capabilities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-full border border-ink/10 bg-paper-bright/70 px-2.5 py-1 font-mono text-[11px] text-ink-soft"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {endpoints.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-ink-mute">
          {endpoints.map(([k, v]) => (
            <span key={k} className="truncate">
              <span className="text-ink-faint">{k}</span> {v as string}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ChainBadge({ chainShort, chainId }: { chainShort: string; chainId: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-bright/50 px-2.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
      <span className="small-caps text-ink-mute">
        {chainShort} · {chainId}
      </span>
    </span>
  );
}

function Cell({
  k,
  v,
  mono,
  href,
}: {
  k: string;
  v: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="bg-paper-bright/55 px-5 py-4">
      <dt className="small-caps text-ink-faint">{k}</dt>
      <dd className={`mt-1.5 ${mono ? "font-mono text-xs" : "text-sm"} text-ink`}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 underline decoration-ink/20 underline-offset-4 transition-colors hover:decoration-ink/60"
          >
            {v}
            <span className="text-ink-faint transition-transform group-hover:translate-x-0.5">↗</span>
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function Rail({
  label,
  hint,
  href,
  primary,
  disabled,
}: {
  label: string;
  hint: string;
  href: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const base = "group flex items-center justify-between gap-4 rounded-2xl px-5 py-4 transition";
  const tone = disabled
    ? "glass cursor-not-allowed opacity-50"
    : primary
      ? "pill-dark text-slate-text hover:-translate-y-0.5"
      : "glass text-ink hover:border-ink/20";

  const inner = (
    <>
      <span>
        <span className={`block font-display text-base font-semibold ${primary ? "text-slate-text" : "text-ink"}`}>
          {label}
        </span>
        <span className={`block text-xs ${primary ? "text-slate-mute" : "text-ink-mute"}`}>{hint}</span>
      </span>
      <span className={`font-mono text-sm ${primary ? "text-slate-text" : "text-ink-mute"} transition-transform group-hover:translate-x-0.5`}>→</span>
    </>
  );

  if (disabled) return <div className={`${base} ${tone}`}>{inner}</div>;
  return (
    <a className={`${base} ${tone}`} href={href}>
      {inner}
    </a>
  );
}

function RailSubmit({ label, hint }: { label: string; hint: string }) {
  return (
    <button
      type="submit"
      className="glass group flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-ink transition hover:border-ink/20"
    >
      <span>
        <span className="block font-display text-base font-semibold">{label}</span>
        <span className="block text-xs text-ink-mute">{hint}</span>
      </span>
      <span className="font-mono text-sm text-ink-mute transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  );
}
