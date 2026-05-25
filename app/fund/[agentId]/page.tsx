import QRCode from "qrcode";
import { buildEip681Uri } from "envoy-pay";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { resolveAgent } from "@/lib/registry";
import { shortAddress } from "@/lib/format";
import { Masthead } from "@/app/_components/Masthead";
import { AuroraMesh } from "@/app/_components/AuroraMesh";
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
    color: { dark: "#F5F5F7", light: "#0D0F1C" },
  });

  return (
    <>
      <AuroraMesh />
      <div className="grid-faint" aria-hidden />
      <Masthead rightSlot={<ChainBadge chainShort={chain.shortName} chainId={chainId} />} />

      <main className="mx-auto max-w-[760px] px-6 pb-28 pt-14">
        {/* header */}
        <Reveal className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-flux-line px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-flux-lime" />
            <span className="small-caps text-flux-mute">
              {agent.source === "registry" ? "ERC-8004 agent" : "demo agent"}
            </span>
          </span>
          <h1 className="mt-6 font-display text-[40px] font-bold leading-[0.98] tracking-[-0.03em] text-flux-white md:text-[60px]">
            Fund agent <span className="iris">№{agent.agentId}</span>
          </h1>
          <p className="mt-4 font-mono text-sm text-flux-mute">
            {amount} {asset} → {shortAddress(agent.agentWallet)} · {chain.shortName}
          </p>
        </Reveal>

        {searchParams.paid && (
          <Reveal delay={0.05} className="mt-8">
            <div className="glass-hot rounded-2xl px-6 py-4 text-center">
              <p className="small-caps text-flux-lime">
                card capture confirmed · {searchParams.paid.slice(0, 16)}…
              </p>
              <p className="mt-1 font-mono text-xs text-flux-mute">
                treasury settlement to {shortAddress(agent.agentWallet)} pending
              </p>
            </div>
          </Reveal>
        )}

        {/* QR */}
        <Reveal delay={0.1} className="mt-12 flex flex-col items-center">
          <QrReveal svg={qrSvg} />
          <p className="mt-5 small-caps text-flux-mute">
            scan with any celo wallet · {asset} · chain {chainId}
          </p>
        </Reveal>

        {/* rails */}
        <Reveal delay={0.15} className="mx-auto mt-12 max-w-[520px]">
          <p className="mb-4 text-center small-caps text-flux-mute">or choose a rail</p>
          <div className="flex flex-col gap-3">
            <Rail label="Open in Celo wallet" hint="Valora · Rainbow · MetaMask" href={eip681} primary />
            {STRIPE_ENABLED ? (
              <form action={`/api/checkout/${params.agentId}?amount=${amount}&asset=${asset}&chain=${chainId}`} method="POST">
                <RailSubmit label="Pay with card · Stripe" hint="Treasury settles cUSD on capture" />
              </form>
            ) : (
              <Rail label="Pay with card · Stripe" hint="Disabled · set STRIPE_SECRET_KEY" href="#" disabled />
            )}
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
          <p className="mb-4 text-center small-caps text-flux-mute">agent record</p>
          <dl className="glass grid grid-cols-1 gap-px overflow-hidden rounded-2xl sm:grid-cols-2">
            <Cell k="Agent ID" v={`#${agent.agentId}`} />
            <Cell k="Network" v={`${chain.shortName} · ${chainId}`} />
            <Cell k="Owner" v={shortAddress(agent.owner, 8, 6)} mono />
            <Cell k="Signing wallet" v={shortAddress(agent.agentWallet, 8, 6)} mono />
            <Cell k="Asset" v={`${assetInfo.label} (${asset})`} />
            <Cell k="Token" v={shortAddress(assetInfo.address, 8, 6)} mono />
          </dl>
          <p className="mt-4 break-all text-center font-mono text-[11px] leading-relaxed text-flux-faint">
            {eip681}
          </p>
        </Reveal>
      </main>
    </>
  );
}

function ChainBadge({ chainShort, chainId }: { chainShort: string; chainId: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-flux-line px-2.5 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-flux-lime" />
      <span className="small-caps text-flux-mute">
        {chainShort} · {chainId}
      </span>
    </span>
  );
}

function Cell({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="bg-flux-base/60 px-5 py-4">
      <dt className="small-caps text-flux-faint">{k}</dt>
      <dd className={`mt-1.5 ${mono ? "font-mono text-xs" : "text-sm"} text-flux-white`}>{v}</dd>
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
      ? "iris-bg text-flux-ink hover:scale-[1.01]"
      : "glass text-flux-white hover:border-flux-mute";

  const inner = (
    <>
      <span>
        <span className={`block font-display text-base font-semibold ${primary ? "text-flux-ink" : "text-flux-white"}`}>
          {label}
        </span>
        <span className={`block text-xs ${primary ? "text-flux-ink/70" : "text-flux-mute"}`}>{hint}</span>
      </span>
      <span className={`font-mono text-sm ${primary ? "text-flux-ink" : "text-flux-mute"} transition-transform group-hover:translate-x-0.5`}>→</span>
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
      className="glass group flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left text-flux-white transition hover:border-flux-mute"
    >
      <span>
        <span className="block font-display text-base font-semibold">{label}</span>
        <span className="block text-xs text-flux-mute">{hint}</span>
      </span>
      <span className="font-mono text-sm text-flux-mute transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  );
}
