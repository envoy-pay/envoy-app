import { NextResponse } from "next/server";
import { stripeIssuingConfigured } from "@/lib/stripeCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether Stripe Issuing is wired on this server (drives the UI's graceful state). */
export async function GET() {
  return NextResponse.json({ configured: stripeIssuingConfigured() });
}
