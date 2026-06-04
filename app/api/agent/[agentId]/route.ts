import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";
import { resolveAgent, getTokenBalance } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live agent read for the hero card. Resolves an ERC-8004 agent on-chain and
 * returns its real signing wallet + live cUSD balance. Demo handles (non-numeric)
 * resolve to placeholder data so the card still renders without a registered agent.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } },
) {
  const url = new URL(req.url);
  const chainId = url.searchParams.get("chain")
    ? Number(url.searchParams.get("chain"))
    : DEFAULT_CHAIN_ID;
  const asset = (url.searchParams.get("asset") as AssetKey) ?? "cUSD";

  try {
    const chain = getCeloChain(chainId);
    const assetInfo = chain.assets[asset];
    if (!assetInfo) {
      return NextResponse.json({ error: `Unsupported asset: ${asset}` }, { status: 400 });
    }

    const agent = await resolveAgent(params.agentId, chainId);
    const balance = await getTokenBalance(
      agent.agentWallet,
      assetInfo.address,
      assetInfo.decimals,
      chainId,
    );

    return NextResponse.json(
      {
        agentId: agent.agentId,
        agentWallet: agent.agentWallet,
        owner: agent.owner,
        walletTail: agent.agentWallet.slice(-4).toUpperCase(),
        balance, // formatted string, or null if RPC unreachable
        asset,
        source: agent.source,
        chainId,
        network: chain.shortName,
        explorer: chain.explorer,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "agent read failed" },
      { status: 404 },
    );
  }
}
