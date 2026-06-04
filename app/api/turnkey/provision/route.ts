import { NextRequest, NextResponse } from "next/server";
import { turnkeyConfigured, provisionAgentWallet } from "@/lib/turnkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provision a fresh, non-exportable agent signing key in Turnkey's enclave.
 * Returns only the public address + wallet id — the private key never leaves the TEE.
 */
export async function POST(req: NextRequest) {
  if (!turnkeyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Turnkey not configured. Set TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY and TURNKEY_ORGANIZATION_ID in web/.env.local to enable TEE custody.",
      },
      { status: 503 },
    );
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { label?: unknown };
    const raw = typeof body.label === "string" ? body.label.trim().slice(0, 40) : "";
    const label = raw ? `Envoy · ${raw}` : "Envoy agent";
    const wallet = await provisionAgentWallet(label);
    return NextResponse.json(wallet, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Turnkey provisioning failed." },
      { status: 502 },
    );
  }
}
