import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Gate for the enclave spending endpoints (/api/turnkey/approve, /api/turnkey/pay).
 * Those move real funds, so they must not be open to the internet.
 *
 * Model: the agent runtime holds AGENT_RUNTIME_SECRET and sends it as
 * `Authorization: Bearer <secret>`.
 *   - secret set   → require a matching bearer token (timing-safe compare).
 *   - secret unset → allowed in development (so the local /pay demo works),
 *                    refused in production.
 *
 * Returns a NextResponse to short-circuit with, or null when the call may proceed.
 */
export function checkAgentAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.AGENT_RUNTIME_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error:
            "This endpoint moves funds and needs AGENT_RUNTIME_SECRET set; the agent runtime sends it as an Authorization: Bearer token.",
        },
        { status: 503 },
      );
    }
    return null; // dev/demo: no secret configured, allow
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}
