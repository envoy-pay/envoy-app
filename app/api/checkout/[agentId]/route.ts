import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { resolveAgent } from "@/lib/registry";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { agentId: string } },
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Stripe is not configured. Set STRIPE_SECRET_KEY in web/.env.local to enable card payments.",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const chainId = url.searchParams.get("chain")
    ? Number(url.searchParams.get("chain"))
    : DEFAULT_CHAIN_ID;
  const asset = (url.searchParams.get("asset") as AssetKey) ?? "cUSD";
  const amount = url.searchParams.get("amount") ?? "1";

  const chain = getCeloChain(chainId);
  const assetInfo = chain.assets[asset];
  if (!assetInfo) return NextResponse.json({ error: "bad asset" }, { status: 400 });
  // Card is charged in USD and settled 1:1 — only USD-pegged assets are sound.
  if (asset === "cEUR") {
    return NextResponse.json(
      { error: "Card settlement supports USD-pegged assets (cUSD, USDC) only." },
      { status: 400 },
    );
  }

  let agent;
  try {
    agent = await resolveAgent(params.agentId, chainId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "agent not found" },
      { status: 404 },
    );
  }

  const origin = req.headers.get("origin") ?? url.origin;
  const fundPath = `/fund/${params.agentId}?amount=${amount}&asset=${asset}&chain=${chainId}`;

  const unitAmount = Math.round(Number(amount) * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    return NextResponse.json({ error: "bad amount" }, { status: 400 });
  }

  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(unitAmount),
    "line_items[0][price_data][product_data][name]": `Fund agent #${agent.agentId}`,
    "line_items[0][price_data][product_data][description]": `Settles ${amount} ${asset} on ${chain.shortName}`,
    "line_items[0][quantity]": "1",
    success_url: `${origin}${fundPath}&paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${fundPath}`,
    "metadata[agentId]": agent.agentId,
    "metadata[agentWallet]": agent.agentWallet,
    "metadata[chainId]": String(chainId),
    "metadata[asset]": asset,
    "metadata[amount]": amount,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const session = (await res.json()) as { url?: string; error?: { message: string } };

  if (!res.ok || !session.url) {
    return NextResponse.json(
      { error: session.error?.message ?? "stripe error" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
