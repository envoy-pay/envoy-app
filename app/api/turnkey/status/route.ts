import { NextResponse } from "next/server";
import { turnkeyConfigured } from "@/lib/turnkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets /create decide whether to offer the Turnkey custody option. No secrets leak. */
export async function GET() {
  return NextResponse.json(
    { configured: turnkeyConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
