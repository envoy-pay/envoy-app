import { NextRequest, NextResponse } from "next/server";
import { SELF_API_BASE } from "@/lib/self";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll a pending Self registration by its (rolling) session token. The client
 * carries the token forward each tick. Stage goes qr-ready → … → completed,
 * at which point the response carries the minted Self Agent ID.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing session token." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(
      `${SELF_API_BASE}/api/agent/register/status?token=${encodeURIComponent(token)}`,
      { redirect: "follow" },
    );
  } catch {
    return NextResponse.json({ error: "Could not reach the Self registration service." }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const msg = (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) || `Self API error (${res.status}).`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json(
    {
      stage: data.stage,
      sessionToken: data.sessionToken ?? token,
      agentId: data.agentId,
      agentAddress: data.agentAddress,
      txHash: data.txHash,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
