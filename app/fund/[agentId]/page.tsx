import QRCode from "qrcode";
import { buildEip681Uri } from "envoy-pay";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { resolveAgent, getTokenBalance } from "@/lib/registry";
import { parseAgentCard, type ParsedCard } from "@/lib/agentCard";
import { shortAddress } from "@/lib/format";
import { Masthead } from "@/app/_components/Masthead";
import { AgentAccountCard } from "@/app/_components/AgentAccountCard";
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
  const balanceValue = liveBalance === null ? null : Number(liveBalance);

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
    color: { dark: "#16171A", light: "#FFFFFF" },
  });

  const walletTail = agent.agentWallet.slice(-4).toUpperCase();
  const isVerified = agent.source === "registry";

  return (
    <>
      <Masthead rightSlot={<ChainBadge chainShort={chain.shortName} chainId={chainId} />} />

      <main className="mx-auto max-w-[1140px] px-6 pb-28 pt-14">
        {/* ── hero ── */}
        <Reveal className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper-bright/50 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
            <span className="small-caps text-ink-mute">
              {isVerified ? "ERC-8004 agent · verified" : "demo agent"}
            </span>
          </span>
          <h1 className="mt-6 font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.03em] text-ink md:text-[60px]">
            Fund agent{" "}
            <span className="text-ink-mute">
              {isNumericId ? `№${agent.agentId}` : agent.agentId}
            </span>
          </h1>
          <p className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 font-mono text-sm text-ink-mute">
            <span className="text-ink">
              {amount} {asset}
            </span>
            <span aria-hidden>→</span>
            <span>{shortAddress(agent.agentWallet)}</span>
            <span className="text-ink-faint">· {chain.shortName}</span>
          </p>
        </Reveal>

        {searchParams.paid && (
          <Reveal delay={0.05} className="mx-auto mt-8 max-w-[680px]">
            <div className="glass-hot flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-center">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-soft" />
              <p className="small-caps text-ink">card captured · {searchParams.paid.slice(0, 16)}…</p>
              <p className="font-mono text-xs text-ink-mute">
                settling cUSD to {shortAddress(agent.agentWallet)} — watch below
              </p>
            </div>
          </Reveal>
        )}

        {/* ── identity (left) · action (right) ── */}
        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10">
          {/* left — who you're funding */}
          <Reveal className="flex flex-col gap-6 lg:sticky lg:top-24">
            <AgentAccountCard
              agentId={String(agent.agentId)}
              walletTail={walletTail}
              balance={balanceValue ?? 0}
              network={chain.shortName}
              {...(isNumericId ? { fetchAgentId: String(agent.agentId), chainId } : {})}
            />

            <VerifiedDetails
              wallet={agent.agentWallet}
              owner={agent.owner}
              assetLabel={`${assetInfo.label} (${asset})`}
              explorer={chain.explorer}
            />

            {(card.card || card.remoteUrl) && <AgentCardPanel parsed={card} />}
          </Reveal>

          {/* right — how to fund */}
          <Reveal delay={0.08} className="flex flex-col gap-6">
            <div className="glass-hot rounded-[28px] p-6 md:p-8">
              <div className="flex items-center justify-between">
                <p className="small-caps text-ink-mute">scan to fund</p>
                <span className="rounded-full border border-ink/10 bg-paper-bright/60 px-3 py-1 font-mono text-[12px] text-ink">
                  {amount} {asset}
                </span>
              </div>

              <div className="mt-6 flex flex-col items-center">
                <QrReveal svg={qrSvg} />
                <p className="mt-3 font-mono text-[11px] text-ink-faint">
                  any celo wallet · settles in {asset}
                </p>
              </div>

              <div className="my-7 flex items-center gap-3">
                <span className="h-px flex-1 bg-ink/[0.08]" />
                <span className="small-caps shrink-0 text-ink-faint">or pay another way</span>
                <span className="h-px flex-1 bg-ink/[0.08]" />
              </div>

              <div className="flex flex-col gap-3">
                <Rail
                  label="Open in Celo wallet"
                  hint="Valora · Rainbow · MetaMask"
                  href={eip681}
                  primary
                />
                {STRIPE_ENABLED ? (
                  <form
                    action={`/api/checkout/${params.agentId}?amount=${amount}&asset=${asset}&chain=${chainId}`}
                    method="POST"
                  >
                    <RailSubmit label="Pay with card · Stripe" hint="Treasury settles cUSD on capture" />
                  </form>
                ) : (
                  <Rail
                    label="Pay with card · Stripe"
                    hint="Disabled · set STRIPE_SECRET_KEY"
                    href="#"
                    disabled
                  />
                )}
              </div>
            </div>

            <WatcherBanner
              wallet={agent.agentWallet}
              chainId={chainId}
              asset={asset}
              chainShortName={chain.shortName}
              explorer={chain.explorer}
            />
          </Reveal>
        </div>
      </main>
    </>
  );
}

/**
 * The verifiable facts a funder actually cares about — where the money lands, who
 * controls the agent, and in what asset. Read straight from chain; protocol noise
 * (token contract, raw EIP-681 URI) is intentionally left off the UI.
 */
function VerifiedDetails({
  wallet,
  owner,
  assetLabel,
  explorer,
}: {
  wallet: string;
  owner: string;
  assetLabel: string;
  explorer: string;
}) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <p className="flag mb-3 text-ink-faint">verified on-chain</p>
      <dl className="flex flex-col divide-y divide-ink/[0.06]">
        <FactRow k="destination" v={shortAddress(wallet, 6, 6)} href={`${explorer}/address/${wallet}`} />
        <FactRow k="owner" v={shortAddress(owner, 6, 6)} href={`${explorer}/address/${owner}`} />
        <FactRow k="asset" v={assetLabel} />
      </dl>
    </div>
  );
}

function FactRow({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="small-caps text-ink-faint">{k}</dt>
      <dd className="font-mono text-[12px] text-ink">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1.5 underline decoration-ink/15 underline-offset-4 transition-colors hover:decoration-ink/50"
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

/**
 * The agent's self-described card (name, capabilities, endpoints). These are
 * descriptive claims — the authoritative owner / signing wallet come only from
 * the on-chain reads in VerifiedDetails, never from the card.
 */
function AgentCardPanel({ parsed }: { parsed: ParsedCard }) {
  if (!parsed.card) {
    if (!parsed.remoteUrl) return null;
    return (
      <a
        href={parsed.remoteUrl}
        target="_blank"
        rel="noreferrer"
        className="group flex items-center justify-between gap-2.5 rounded-2xl border border-ink/10 bg-paper-bright/50 px-5 py-3.5 transition-colors hover:border-ink/20"
      >
        <span className="small-caps text-ink-mute">agent card</span>
        <span className="flex items-center gap-2 font-mono text-[12px] text-ink-soft">
          hosted off-chain ({parsed.source})
          <span className="text-ink-faint transition-transform group-hover:translate-x-0.5">view ↗</span>
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
          <span className="small-caps text-ink-mute">verified</span>
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
        <span
          className={`block font-display text-base font-semibold ${primary ? "text-slate-text" : "text-ink"}`}
        >
          {label}
        </span>
        <span className={`block text-xs ${primary ? "text-slate-mute" : "text-ink-mute"}`}>{hint}</span>
      </span>
      <span
        className={`font-mono text-sm ${primary ? "text-slate-text" : "text-ink-mute"} transition-transform group-hover:translate-x-0.5`}
      >
        →
      </span>
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
