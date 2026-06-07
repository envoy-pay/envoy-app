import { NextRequest, NextResponse } from "next/server";
import { setCardControls } from "@/lib/stripeCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update a card's spending controls.
 * Body: { cardId, perAuthorization?, daily?, monthly? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      cardId?: string;
      perAuthorization?: string;
      daily?: string;
      monthly?: string;
    };
    if (!body.cardId) {
      return NextResponse.json({ error: "cardId is required." }, { status: 400 });
    }
    const card = await setCardControls(body.cardId, {
      perAuthorization: body.perAuthorization?.trim() || undefined,
      daily: body.daily?.trim() || undefined,
      monthly: body.monthly?.trim() || undefined,
    });
    return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Updating controls failed." },
      { status: 502 },
    );
  }
}
