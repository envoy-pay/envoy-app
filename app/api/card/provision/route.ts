import { NextRequest, NextResponse } from "next/server";
import { provisionCard } from "@/lib/stripeCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provision a stablecoin-backed virtual card linked to an agent's wallet.
 * Body: { agentId?, walletAddress, perAuthorization?, daily? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      agentId?: string | number;
      walletAddress?: string;
      perAuthorization?: string;
      daily?: string;
    };
    if (!body.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.walletAddress)) {
      return NextResponse.json({ error: "A valid agent walletAddress is required." }, { status: 400 });
    }
    const card = await provisionCard({
      agentId: body.agentId != null ? String(body.agentId) : undefined,
      walletAddress: body.walletAddress,
      spendingControls: {
        perAuthorization: body.perAuthorization?.trim() || undefined,
        daily: body.daily?.trim() || undefined,
      },
    });
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Card provisioning failed." },
      { status: 502 },
    );
  }
}
