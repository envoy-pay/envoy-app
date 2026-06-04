import { NextRequest, NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { turnkeyConfigured, signTypedDataWithTurnkey } from "@/lib/turnkey";
import { agentWalletSetTypedData } from "@/lib/abi";
import { getEnvoyAddresses } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constrained signing oracle. This endpoint will ONLY ever produce an
 * `AgentWalletSet` signature bound to a known Envoy Identity Registry — the
 * typed data is reconstructed here from primitive values, so a caller cannot
 * coax it into signing arbitrary payloads (token approvals, other contracts).
 * Turnkey additionally refuses to sign for any address it doesn't control.
 */
export async function POST(req: NextRequest) {
  if (!turnkeyConfigured()) {
    return NextResponse.json({ error: "Turnkey not configured." }, { status: 503 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const chainId = Number(body.chainId);
    const agentId = String(body.agentId ?? "");
    const deadline = String(body.deadline ?? "");
    const newWallet = body.newWallet;
    const owner = body.owner;

    if (!Number.isInteger(chainId)) throw new Error("Invalid chainId.");
    if (typeof newWallet !== "string" || !isAddress(newWallet)) throw new Error("Invalid newWallet.");
    if (typeof owner !== "string" || !isAddress(owner)) throw new Error("Invalid owner.");
    if (!/^\d+$/.test(agentId)) throw new Error("Invalid agentId.");
    if (!/^\d+$/.test(deadline)) throw new Error("Invalid deadline.");

    // getEnvoyAddresses throws for unknown chains — pins the verifying contract.
    const { identityRegistry } = getEnvoyAddresses(chainId);

    const typed = agentWalletSetTypedData({
      chainId,
      registry: identityRegistry,
      agentId: BigInt(agentId),
      newWallet: newWallet as Address,
      owner: owner as Address,
      deadline: BigInt(deadline),
    });

    const signature = await signTypedDataWithTurnkey(newWallet as Address, typed);
    return NextResponse.json({ signature }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Turnkey signing failed." },
      { status: 502 },
    );
  }
}
