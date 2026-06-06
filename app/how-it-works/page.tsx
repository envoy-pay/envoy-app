import Link from "next/link";
import type { Metadata } from "next";
import { Masthead } from "@/app/_components/Masthead";
import { Reveal, Typewriter } from "@/app/_components/motion";
import { Terminal, type TermLine } from "@/app/_components/Terminal";
import { shortAddress } from "@/lib/format";
import { DEFAULT_AGENT_ID, DEFAULT_CHAIN_ID } from "@/lib/chains";

export const metadata: Metadata = {
  title: "How it works — Envoy",
  description:
    "How Envoy gives an AI agent its own on-chain account on Celo: an ERC-8004 identity it owns, a signing key you custody, and atomic cUSD settlement — the full machine, end to end.",
};

const EXPLORER = "https://celoscan.io";

const TERM: TermLine[] = [
  { k: "cmd", t: "envoy demo --agent 128 --pay-per-call" },
  { k: "info", t: "connecting to Celo mainnet · chain 42220" },
  { k: "ok", t: "agent #128 ready · signing wallet 0x53eaF4…0088" },
  { k: "info", t: "agent → POST /premium/market-report" },
  { k: "dim", t: "← 402 Payment Required · x402 asks 0.001 cUSD" },
  { k: "info", t: "EnvoyClient intercepts the 402 · checks budget policy" },
  { k: "ok", t: "within policy · signs EIP-712 PaymentAuth" },
  { k: "info", t: "facilitator.pay() · net → merchant · fee → treasury" },
  { k: "ok", t: "Settled · tx 0x4c1e…ab90 · block 28,114,552" },
  { k: "info", t: "agent retries with the on-chain receipt as proof" },
  { k: "ok", t: "200 OK · paid data received · no human in the loop" },
];

const CONTRACTS = [
  {
    name: "EnvoyFacilitator",
    role: "Atomic x402 / MPP settlement — verifies the agent's signature, moves cUSD, emits the receipt.",
    address: "0xE268B6fE16319b49D22562C93c0d2395F65FCAcC",
    kind: "address",
  },
  {
    name: "ERC-8004 Identity Registry",
    role: "Canonical agent identity. Holds the owner NFT and the agent's authorized signing wallet.",
    address: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    kind: "address",
  },
  {
    name: "ERC-8004 Reputation Registry",
    role: "Canonical feedback / reputation attestations for agents.",
    address: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    kind: "address",
  },
  {
    name: "cUSD",
    role: "Celo Dollar — the settlement asset every rail resolves into.",
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    kind: "token",
  },
] as const;

const STANDARDS = [
  { k: "ERC-8004", v: "agent identity" },
  { k: "x402", v: "pay-per-request" },
  { k: "MPP", v: "merchant payment protocol" },
  { k: "EIP-712", v: "typed payment auth" },
  { k: "ERC-1271", v: "smart-wallet signatures" },
  { k: "EIP-681", v: "payment request URIs" },
];

export default function HowItWorksPage() {
  const fundHref = `/fund/${DEFAULT_AGENT_ID}?chain=${DEFAULT_CHAIN_ID}`;

  const ONBOARD = [
    {
      n: "01",
      title: "Create an agent",
      href: "/create",
      blurb:
        "Mint an ERC-8004 identity you own. Envoy generates the agent's own signing key — in your browser or a secure enclave — and binds it on-chain.",
      cta: "Create an agent",
      external: false,
    },
    {
      n: "02",
      title: "Fund it",
      href: fundHref,
      blurb:
        "Share a QR or a link. Anyone tops it up from any wallet — or a card — and it lands in the account as cUSD.",
      cta: "Open the fund page",
      external: false,
    },
    {
      n: "03",
      title: "Let it pay",
      href: "/pay",
      blurb:
        "Your agent signs an EIP-712 authorization; the facilitator settles to the merchant atomically, with an on-chain receipt.",
      cta: "Try a pay-out",
      external: false,
    },
  ];

  return (
    <>
      <Masthead />

      <main className="mx-auto max-w-[960px] px-6 pb-28 pt-16">
        {/* ── intro ── */}
        <Reveal className="max-w-[44rem]">
          <span className="small-caps text-ink-mute">how it works</span>
          <h1 className="mt-4 flex min-h-[2.2em] items-start font-display text-[clamp(34px,5vw,58px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
            <Typewriter
              phrases={[
                "An agent that pays for itself.",
                "Money, moved by software.",
                "No human in the loop.",
              ]}
            />
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
            Envoy gives any AI agent a real on-chain account on Celo — an{" "}
            <span className="font-medium text-ink">ERC-8004 identity</span> it owns,
            funded down any rail, settling in{" "}
            <span className="font-medium text-ink">cUSD</span>. Here&apos;s the whole
            machine: who controls it, how a payment clears, and where the keys live.
          </p>
        </Reveal>

        {/* ── the model (the actors, explained first) ── */}
        <Section eyebrow="the model" title="One agent, two keys.">
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal delay={0}>
              <Card
                head="The owner"
                sub="holds the NFT"
                body="An ERC-8004 NFT. Whoever holds it controls the agent — sets spending limits, rotates the signer, can sell or retire it. That's you."
              />
            </Reveal>
            <Reveal delay={0.12}>
              <Card
                head="The signing wallet"
                sub="authorizes payments"
                body="A separate key the owner authorizes on-chain. It signs every payment. Transfer the NFT and the registry clears it — instantly revoking pay-outs. No backend toggle."
              />
            </Reveal>
          </div>
          <p className="mt-4 max-w-[42rem] text-[14px] leading-relaxed text-ink-mute">
            Settlement is atomic: the facilitator verifies the signature against the
            canonical registry, then moves cUSD straight from the agent to the merchant
            (and a capped fee to the treasury) in a single transaction. It never holds
            funds.
          </p>
        </Section>

        {/* ── the autonomous loop (now that you know the actors, watch it run) ── */}
        <Section eyebrow="the loop" title="From a 402 to paid data.">
          <p className="mb-6 max-w-[42rem] text-[15px] leading-relaxed text-ink-soft">
            The thesis, runnable: the agent calls a paid API, gets a 402, settles it
            itself through the facilitator, then retries with the on-chain receipt —
            all signed, all on Celo, no human approving a thing.
          </p>
          <Reveal>
            <Terminal lines={TERM} />
          </Reveal>
        </Section>

        {/* ── custody (where the signing key lives) ── */}
        <Section eyebrow="custody" title="Hold the signer your way.">
          <p className="mb-6 max-w-[42rem] text-[15px] leading-relaxed text-ink-soft">
            The signing key is the agent&apos;s hands — so you choose where it lives.
            Pick when you create the agent; the on-chain identity is identical either way.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Reveal delay={0}>
              <Card
                head="Self-custody"
                sub="keys in your hands"
                body="Generated in your browser with secure randomness and revealed exactly once. You hold it and back it up — nothing ever leaves the device or touches our servers."
              />
            </Reveal>
            <Reveal delay={0.12}>
              <Card
                head="Turnkey enclave"
                sub="TEE · non-exportable"
                body="Provisioned inside a Turnkey secure enclave (TEE). The key is non-exportable and never leaves the hardware — the agent signs every EIP-712 payment through the enclave API. Ideal for an agent that runs unattended."
              />
            </Reveal>
          </div>
          <p className="mt-4 max-w-[42rem] text-[14px] leading-relaxed text-ink-mute">
            Either way the owner stays in control: the signer is bound on-chain, gated by a
            spending policy you set (per-transaction and daily caps), and revoked the instant
            the owner NFT moves.
          </p>
        </Section>

        {/* ── now do it: the three steps ── */}
        <Section eyebrow="get started" title="Three steps to a paid agent.">
          <div className="grid gap-4 md:grid-cols-3">
            {ONBOARD.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <Link
                  href={s.href}
                  className="glass group flex h-full flex-col rounded-2xl p-6 transition-transform hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[12px] text-ink-faint">{s.n}</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink/10 font-mono text-xs text-ink-mute transition-colors group-hover:border-ink/30 group-hover:text-ink">
                      →
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-xl font-bold tracking-tight text-ink">
                    {s.title}
                  </h3>
                  <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-soft">
                    {s.blurb}
                  </p>
                  <span className="mt-5 small-caps text-ink transition-colors group-hover:text-ink-soft">
                    {s.cta} →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── live contracts (the proof) ── */}
        <Section eyebrow="live on celo" title="Deployed, not described.">
          <p className="mb-6 max-w-[42rem] text-[15px] leading-relaxed text-ink-soft">
            It&apos;s all running on Celo Mainnet (chain&nbsp;42220) right now. Open any
            contract on Celoscan.
          </p>
          <div className="glass overflow-hidden rounded-2xl">
            {CONTRACTS.map((c, i) => (
              <Reveal key={c.address} delay={i * 0.08} y={12}>
                <a
                  href={`${EXPLORER}/${c.kind}/${c.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-ink/[0.03] md:flex-row md:items-center md:justify-between md:gap-6 ${
                    i > 0 ? "border-t border-ink/[0.07]" : ""
                  }`}
                >
                  <div className="md:max-w-[58%]">
                    <p className="font-display text-[15px] font-semibold text-ink">{c.name}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-mute">{c.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] text-ink-soft">
                      {shortAddress(c.address, 8, 6)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint transition-transform group-hover:translate-x-0.5">
                      ↗
                    </span>
                  </div>
                </a>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] text-ink-faint">
            facilitator is immutable · zero internal balance · fee capped at 2.00% on-chain
          </p>
        </Section>

        {/* ── standards ── */}
        <Section eyebrow="built on" title="Open standards, all the way down.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STANDARDS.map((s, i) => (
              <Reveal key={s.k} delay={i * 0.07} y={14}>
                <div className="glass rounded-xl px-4 py-4">
                  <p className="font-mono text-sm font-semibold text-ink">{s.k}</p>
                  <p className="mt-1 small-caps text-ink-mute">{s.v}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* ── CTA ── */}
        <Reveal className="mt-20">
          <div className="glass flex flex-col items-start gap-5 rounded-[28px] px-7 py-9 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-ink md:text-3xl">
                Ready? Mint your agent.
              </h2>
              <p className="mt-2 text-[15px] text-ink-soft">
                A few signed steps and your agent has an account it controls.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/create"
                className="pill-dark group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold text-slate-text"
              >
                Create an agent
                <span className="font-mono text-xs transition-transform group-hover:translate-x-0.5">↗</span>
              </Link>
              <Link
                href={fundHref}
                className="pill inline-flex items-center rounded-full px-5 py-2.5 text-[14px] font-medium text-ink transition-transform hover:-translate-y-0.5"
              >
                Fund the demo
              </Link>
            </div>
          </div>
        </Reveal>
      </main>

      <footer className="relative border-t border-ink/[0.08]">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6">
          <Feat>erc-8004</Feat>
          <Dot />
          <Feat>cUSD settlement</Feat>
          <Dot />
          <Feat>on-chain receipts</Feat>
          <Dot />
          <Feat>open source</Feat>
        </div>
      </footer>
    </>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="mt-20">
      <span className="small-caps text-ink-mute">{eyebrow}</span>
      <h2 className="mb-7 mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
        {title}
      </h2>
      {children}
    </Reveal>
  );
}

function Card({ head, sub, body }: { head: string; sub: string; body: string }) {
  return (
    <div className="glass h-full rounded-2xl px-6 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-bold tracking-tight text-ink">{head}</p>
        <span className="small-caps text-ink-faint">{sub}</span>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

function Feat({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-faint">
      {children}
    </span>
  );
}

function Dot() {
  return <span className="h-1 w-1 rounded-full bg-ink-faint/50" aria-hidden />;
}
