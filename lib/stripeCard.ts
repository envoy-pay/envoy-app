/**
 * Server-side Stripe Issuing client for the /card flow.
 *
 * Issues a stablecoin-backed virtual card linked to an agent's wallet, so the
 * agent can pay anything that takes a Visa/Mastercard (subscriptions, domains,
 * SaaS). Mirrors `StripeCardPayoutProvider` in the envoy-pay SDK — once the SDK's
 * `envoy-pay/payouts` subpath is published, this can be replaced by importing it.
 *
 * Calls Stripe directly (Basic auth + form-encoded), exactly like the Stripe
 * webhook route. Stablecoin Issuing is private preview + a Bridge onboarding, and
 * Celo/cUSD funding needs Bridge confirmation — provisioning will surface Stripe's
 * own error (e.g. "Issuing not enabled") until the program is live.
 *
 * @see https://docs.stripe.com/issuing/stablecoin-cards
 */
const API_BASE = "https://api.stripe.com";

export interface SpendingControlsInput {
  /** Max per authorization, human USD, e.g. "50". */
  perAuthorization?: string;
  /** Max per day, human USD. */
  daily?: string;
  /** Max per month, human USD. */
  monthly?: string;
}

export interface ProvisionCardInput {
  agentId?: string;
  /** The agent's on-chain wallet that funds the card (non-custodial JIT). */
  walletAddress?: string;
  cardholderId?: string;
  cardholderName?: string;
  chain?: string;
  stablecoin?: string;
  walletType?: "standard" | "bridge_wallet";
  spendingControls?: SpendingControlsInput;
}

export interface IssuedCard {
  id: string;
  last4?: string;
  brand?: string;
  status: string;
}

interface StripeCardResponse {
  id: string;
  last4?: string;
  brand?: string;
  status: string;
}

/** Whether Stripe Issuing is wired (a secret key is present). */
export function stripeIssuingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function secretKey(): string {
  const k = process.env.STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY is not set — Stripe Issuing is unavailable.");
  return k;
}

async function stripe<T>(
  method: "GET" | "POST",
  path: string,
  form?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const version = process.env.STRIPE_API_VERSION;
  if (version) headers["Stripe-Version"] = version;
  const account = process.env.STRIPE_ACCOUNT;
  if (account) headers["Stripe-Account"] = account;

  let url = `${API_BASE}${path}`;
  let body: string | undefined;
  if (form) {
    const encoded = new URLSearchParams(form).toString();
    if (method === "GET") url += `?${encoded}`;
    else body = encoded;
  }

  const res = await fetch(url, { method, headers, body });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const message = (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    throw new Error(message);
  }
  return json as T;
}

function toCents(human: string): string {
  const cents = Math.round(parseFloat(human) * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`Invalid amount: "${human}"`);
  return String(cents);
}

function applyControls(form: Record<string, string>, sc?: SpendingControlsInput): void {
  if (!sc) return;
  let i = 0;
  const add = (amount: string, interval: string) => {
    form[`spending_controls[spending_limits][${i}][amount]`] = toCents(amount);
    form[`spending_controls[spending_limits][${i}][interval]`] = interval;
    i += 1;
  };
  if (sc.perAuthorization) add(sc.perAuthorization, "per_authorization");
  if (sc.daily) add(sc.daily, "daily");
  if (sc.monthly) add(sc.monthly, "monthly");
}

export async function provisionCard(input: ProvisionCardInput): Promise<IssuedCard> {
  let cardholderId = input.cardholderId;
  if (!cardholderId) {
    const cardholder = await stripe<{ id: string }>("POST", "/v1/issuing/cardholders", {
      name: input.cardholderName ?? `Envoy Agent ${input.agentId ?? ""}`.trim(),
      type: "individual",
      "billing[address][line1]": "1 Market St",
      "billing[address][city]": "San Francisco",
      "billing[address][state]": "CA",
      "billing[address][postal_code]": "94105",
      "billing[address][country]": "US",
    });
    cardholderId = cardholder.id;
  }

  const form: Record<string, string> = {
    cardholder: cardholderId,
    currency: "usd",
    type: "virtual",
    status: "active",
    "crypto_wallet[chain]": input.chain ?? process.env.STRIPE_CARD_CHAIN ?? "celo",
    "crypto_wallet[currency]": input.stablecoin ?? process.env.STRIPE_CARD_STABLECOIN ?? "cusd",
    "crypto_wallet[type]": input.walletType ?? "standard",
  };
  if (input.walletAddress) form["crypto_wallet[address]"] = input.walletAddress;
  if (input.agentId) form["metadata[agentId]"] = input.agentId;
  applyControls(form, input.spendingControls);

  const card = await stripe<StripeCardResponse>("POST", "/v1/issuing/cards", form);
  return { id: card.id, last4: card.last4, brand: card.brand, status: card.status };
}

export async function setCardControls(
  cardId: string,
  controls: SpendingControlsInput,
): Promise<IssuedCard> {
  const form: Record<string, string> = {};
  applyControls(form, controls);
  const card = await stripe<StripeCardResponse>("POST", `/v1/issuing/cards/${cardId}`, form);
  return { id: card.id, last4: card.last4, brand: card.brand, status: card.status };
}
