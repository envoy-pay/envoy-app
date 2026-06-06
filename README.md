# Envoy — web app

**Give an AI agent its own on-chain account: mint its identity, fund it, set hard
spending limits, and let it pay autonomously on Celo — no human co-signs a single
payment, yet a real human stays accountable.**

This is the Envoy product UI. It turns the [`envoy-pay`](https://github.com/envoy-pay/envoy-pay)
SDK and its deployed Celo contracts into a full, click-through lifecycle: create an
ERC-8004 agent, choose how its key is custodied, write an on-chain spending policy,
fund it with crypto **or** a card, optionally bind it to a passport-proven human,
and watch it settle payments on-chain.

Built with Next.js (App Router) · TypeScript · viem · Tailwind. Live on **Celo Mainnet**.

---

## What it does

| Capability | Where | Notes |
|---|---|---|
| **Mint an ERC-8004 identity** | `/create` | Writes the agent card on-chain as a `data:` URI on Celo (Mainnet or Sepolia). |
| **Two custody models** | `/create` | **Self-custody** (key generated in-browser, revealed once) or **Turnkey TEE** (key born in a secure enclave, non-exportable, signs via API). |
| **On-chain spending policy** | `/create` | A hard per-tx + daily ceiling enforced by `EnvoyFacilitator` — the agent can never exceed it; the owner can rotate or revoke its key anytime. |
| **Proof-of-human** | `/create` | Optionally bind the agent to a real, of-age, sanctions-clean human via [Self Agent ID](https://docs.self.xyz/self-agent-id/overview) — a passport ZK-proof, nothing leaves the owner's phone. |
| **Fund with crypto or card** | `/fund/[id]` | Direct cUSD transfer, or **Stripe card → cUSD** settled on-chain by the treasury. |
| **Autonomous pay** | `/pay` | The enclave settlement demo — an agent pays through the facilitator with no wallet pop-up. |
| **Explainer** | `/how-it-works` | The thesis, in plain English. |

The **trust triangle** a merchant can require before serving an agent — *paid
on-chain* + *declares the capability* (ERC-8004) + *human-backed* (Self) — is the
product's core idea: **autonomy without anonymity**.

---

## Architecture

```
Browser (client components)        Server routes (Node runtime, secrets only here)
─────────────────────────────      ─────────────────────────────────────────────
/create  mint · custody · policy   /api/turnkey/*   provision · sign · approve · pay (TEE)
/fund    crypto + card checkout    /api/stripe/*    checkout session · card→cUSD webhook
/pay     enclave settlement demo   /api/self/*      proof-of-human register · status (Self)
                                   /api/agent/[id]  on-chain agent reads
                                   /api/watch/[w]   wallet activity
        │                                   │
        └────────── envoy-pay SDK ──────────┴────────► Celo (EnvoyFacilitator,
                    + viem                              ERC-8004 Identity)
```

Two principles make it production-shaped:

- **Secrets never reach the browser.** Every key-bearing or fund-moving operation —
  Turnkey signing, the treasury that settles card payments, the Self proxy — runs in
  a **Node runtime server route**. The client only ever sees public data and signed
  results.
- **Progressive enhancement.** The app runs against live Celo with **zero config**
  (browse, mint self-custody, set a policy). Each integration unlocks as you add its
  env — Turnkey, Stripe, settlement, proof-of-human — so you can ship a subset and
  grow into the rest.

---

## Quickstart (local)

```bash
npm install
npm run dev        # http://localhost:3000
```

With no env at all you can already connect a wallet, mint a self-custody agent on
Celo, and set an on-chain spending policy. Copy `.env.example` → `.env.local` to turn
on the rest.

```bash
npm run typecheck  # tsc --noEmit
npm run test       # vitest
npm run build      # production build
```

---

## Configuration

Full documentation lives in [`.env.example`](./.env.example). What each tier unlocks:

| Set this | Unlocks |
|---|---|
| *(nothing)* | Browse, mint **self-custody** agents, set on-chain policy, **Self Agent ID** proof-of-human (works zero-config) |
| `NEXT_PUBLIC_DEFAULT_AGENT_ID` / `_CHAIN_ID` | Which agent the landing card + “Fund me” point at |
| `TURNKEY_*` | **Turnkey TEE** custody option on `/create` |
| `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | “Pay with card” checkout on `/fund` |
| `STRIPE_WEBHOOK_SECRET` + `TREASURY_PRIVATE_KEY` | Card → cUSD on-chain settlement |
| `KV_REST_API_URL` / `_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Durable settlement idempotency (see below) |
| `AGENT_RUNTIME_SECRET` | Locks the fund-moving enclave endpoints (`/api/turnkey/approve`, `/api/turnkey/pay`) |
| `SELF_AGENT_API_BASE` | Override the Self API base (defaults to `https://app.ai.self.xyz`) |

---

## Deploying to production

The app deploys cleanly to **Vercel** (`next build`, all server routes are Node
runtime). Before going live, confirm this checklist — these are the differences
between the local demo and a safe production deployment:

- [ ] **`AGENT_RUNTIME_SECRET` is set to a strong random value.** The enclave
      *spending* endpoints move funds. Unset, they are **open in dev but refused in
      production** — so production simply won't move money until you set this. Your
      agent runtime sends it as `Authorization: Bearer <secret>`.
- [ ] **A durable idempotency store is configured** (`KV_REST_API_*` or
      `UPSTASH_REDIS_REST_*`). The Stripe webhook must settle each checkout session
      **exactly once**; without a shared store it falls back to in-memory dedupe,
      which is **not safe across serverless instances** — two instances could
      double-settle a card payment. The build logs a warning when it's missing.
- [ ] **`TREASURY_PRIVATE_KEY` is a funded, dedicated treasury wallet** (holds the
      cUSD that backs card settlements), managed as a production secret.
- [ ] **Stripe is in live mode** with the webhook endpoint registered and its
      signing secret in `STRIPE_WEBHOOK_SECRET`.
- [ ] **All secrets are set as encrypted env vars** in the host, never committed.

> Note: the facilitator (spending policy + autonomous `/pay`) is **Celo Mainnet
> only**. On Sepolia the app mints and binds the key but skips the on-chain policy.

---

## Security posture

This is a payments app; it's built accordingly.

- **Server-only secrets.** Turnkey API keys, the treasury key, and the Stripe
  secret are read only inside Node runtime routes — never bundled, never sent to the
  client.
- **Fund-moving endpoints are gated.** The Turnkey spending routes require
  `AGENT_RUNTIME_SECRET` and refuse to run unauthenticated in production.
- **Non-exportable keys by default for managed custody.** Turnkey keys are generated
  inside the enclave and never leave it; self-custody keys are shown to the operator
  exactly once and never persisted, logged, or transmitted by Envoy.
- **Hard on-chain limits.** Even a fully compromised agent key can only spend up to
  the per-tx and daily caps the owner set, and the owner can revoke the key on-chain.
- **Privacy-preserving identity.** Self Agent ID proves *human / of-age / sanctions-clean*
  via zero-knowledge — Envoy stores **no** personal data.
- **Idempotent settlement.** Card→cUSD settlement dedupes on the Stripe session id.

Not yet independently audited — review before handling material value.

---

## Part of Envoy

| Repo | Role |
|---|---|
| [`envoy-pay`](https://github.com/envoy-pay/envoy-pay) | SDK ([`envoy-pay`](https://www.npmjs.com/package/envoy-pay) on npm) + Solidity contracts — the open, on-chain infrastructure |
| **`envoy-app`** | This product UI |

Deployed contract addresses (Identity registry, facilitator, cUSD) come from the SDK
via `lib/contracts.ts` — a single source of truth for both repos.

## License

Apache-2.0
