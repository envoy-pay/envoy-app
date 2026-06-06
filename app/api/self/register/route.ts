import { NextRequest, NextResponse } from "next/server";
import {
  SELF_API_BASE,
  selfNetworkForChain,
  type SelfDisclosures,
} from "@/lib/self";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Start a Self Agent ID registration. Proxies the hosted Self API so the browser
 * never has to depend on its CORS policy, and so we can pin the canonical base.
 * Returns the QR + deep link the owner scans in the Self app, plus the rolling
 * session token the client polls /api/self/status with.
 */
export async function POST(req: NextRequest) {
  let body: {
    chainId?: number;
    humanAddress?: string;
    agentName?: string;
    agentDescription?: string;
    minimumAge?: number;
    ofac?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { chainId, humanAddress, agentName, agentDescription } = body;
  if (!chainId || (chainId !== 42220 && chainId !== 11142220)) {
    return NextResponse.json({ error: "Unsupported chainId." }, { status: 400 });
  }
  if (!humanAddress || !ADDRESS.test(humanAddress)) {
    return NextResponse.json({ error: "A valid owner (human) address is required." }, { status: 400 });
  }

  const network = selfNetworkForChain(chainId);
  const disclosures: SelfDisclosures = {};
  if (body.minimumAge === 18 || body.minimumAge === 21) disclosures.minimumAge = body.minimumAge;
  if (body.ofac) disclosures.ofac = true;

  const payload = {
    mode: "linked", // owner (human) ≠ agent: Self generates + binds the agent key
    network,
    humanAddress,
    agentName: agentName?.trim() || "Envoy Agent",
    ...(agentDescription?.trim() ? { agentDescription: agentDescription.trim() } : {}),
    ...(Object.keys(disclosures).length ? { disclosures } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${SELF_API_BASE}/api/agent/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
  } catch {
    return NextResponse.json({ error: "Could not reach the Self registration service." }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const msg = (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) || `Self API error (${res.status}).`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Forward only what the client needs to render the scan + poll loop.
  return NextResponse.json(
    {
      sessionToken: data.sessionToken,
      stage: data.stage,
      deepLink: data.deepLink,
      scanUrl: data.scanUrl,
      qrImageBase64: data.qrImageBase64,
      agentAddress: data.agentAddress,
      expiresAt: data.expiresAt,
      timeRemainingMs: data.timeRemainingMs,
      humanInstructions: data.humanInstructions ?? [],
      network,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
