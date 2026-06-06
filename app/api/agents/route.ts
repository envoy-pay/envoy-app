import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { celo } from "viem/chains";
import { DEFAULT_CHAIN_ID, getCeloChain } from "@/lib/chains";
import { getEnvoyAddresses } from "@/lib/contracts";
import { ERC8004_IDENTITY_ABI } from "@/lib/abi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List the ERC-8004 agents owned by a wallet — the data behind the /pay agent
 * picker. The canonical registry isn't ERC-721 Enumerable, so we scan its
 * `Registered(agentId, …, owner)` event (owner is indexed) over a recent window,
 * then verify each is still owned and resolve its signing wallet.
 *
 * The public Celo RPC serves ~1M blocks per getLogs; we chunk + parallelize and
 * look back ~1M blocks (~58 days), which covers every agent minted to date.
 */
const REGISTERED = parseAbiItem(
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
);
const LOOKBACK = 1_000_000n; // ~58 days at ~5s/block
const CHUNK = 250_000n; // comfortably within the RPC's per-call range

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner") as Address | null;
  const chainId = url.searchParams.get("chain")
    ? Number(url.searchParams.get("chain"))
    : DEFAULT_CHAIN_ID;

  if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
    return NextResponse.json({ error: "valid ?owner=0x… required" }, { status: 400 });
  }

  try {
    const chain = getCeloChain(chainId);
    const { identityRegistry } = getEnvoyAddresses(chainId);
    const client = createPublicClient({ chain: celo, transport: http(chain.rpcUrl) });

    const latest = await client.getBlockNumber();
    const start = latest > LOOKBACK ? latest - LOOKBACK : 0n;

    // Build chunk ranges and scan them in parallel (owner-filtered → few logs).
    const ranges: Array<[bigint, bigint]> = [];
    for (let from = start; from <= latest; from += CHUNK + 1n) {
      ranges.push([from, from + CHUNK > latest ? latest : from + CHUNK]);
    }
    const logsByChunk = await Promise.all(
      ranges.map(([from, to]) =>
        client.getLogs({
          address: identityRegistry,
          event: REGISTERED,
          args: { owner },
          fromBlock: from,
          toBlock: to,
        }),
      ),
    );

    const ids = new Set<string>();
    for (const logs of logsByChunk) {
      for (const l of logs) {
        const id = (l.args as { agentId?: bigint }).agentId;
        if (id !== undefined) ids.add(id.toString());
      }
    }

    // Verify still owned (drop NFTs transferred away) + resolve signing wallets.
    const resolved = await Promise.all(
      [...ids].map(async (idStr) => {
        const id = BigInt(idStr);
        try {
          const [curOwner, wallet] = await Promise.all([
            client.readContract({
              address: identityRegistry,
              abi: ERC8004_IDENTITY_ABI,
              functionName: "ownerOf",
              args: [id],
            }) as Promise<Address>,
            client.readContract({
              address: identityRegistry,
              abi: ERC8004_IDENTITY_ABI,
              functionName: "getAgentWallet",
              args: [id],
            }) as Promise<Address>,
          ]);
          if (curOwner.toLowerCase() !== owner.toLowerCase()) return null;
          return {
            agentId: idStr,
            agentWallet: wallet,
            walletTail: wallet.slice(-4).toUpperCase(),
          };
        } catch {
          return null; // burned / unreadable
        }
      }),
    );

    const agents = resolved
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .sort((a, b) => Number(BigInt(b.agentId) - BigInt(a.agentId))); // newest first

    return NextResponse.json(
      { owner, chainId, agents, scannedFromBlock: start.toString(), latestBlock: latest.toString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "agent enumeration failed" },
      { status: 500 },
    );
  }
}
