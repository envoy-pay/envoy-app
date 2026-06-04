import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseUnits, type Address } from "viem";
import { turnkeyConfigured, celoPublicClient, turnkeyClients } from "@/lib/turnkey";
import { checkAgentAuth } from "@/lib/agentAuth";
import { ERC20_ABI, ERC8004_IDENTITY_ABI } from "@/lib/abi";
import { getEnvoyAddresses } from "@/lib/contracts";
import { getCeloChain } from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Ensure the agent's enclave wallet has approved the facilitator to pull cUSD.
 * The approval transaction is signed by Turnkey and paid for by the agent wallet
 * (it needs a little CELO for gas). No-op if the allowance already covers `amount`.
 */
export async function POST(req: NextRequest) {
  const denied = checkAgentAuth(req);
  if (denied) return denied;
  if (!turnkeyConfigured()) {
    return NextResponse.json({ error: "Turnkey not configured." }, { status: 503 });
  }
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const chainId = Number(body.chainId);
    const agentId = String(body.agentId ?? "");
    const amount = String(body.amount ?? "");

    if (!Number.isInteger(chainId)) throw new Error("Invalid chainId.");
    if (!/^\d+$/.test(agentId)) throw new Error("Invalid agentId.");
    if (!/^\d*\.?\d+$/.test(amount)) throw new Error("Invalid amount.");

    const { facilitator, identityRegistry } = getEnvoyAddresses(chainId);
    if (facilitator === ZERO) throw new Error("Facilitator not deployed on this chain.");
    const chain = getCeloChain(chainId);
    const token = chain.assets.cUSD.address;
    const value = parseUnits(amount, chain.assets.cUSD.decimals);
    if (value <= 0n) throw new Error("Amount must be greater than zero.");

    const reader = celoPublicClient(chainId);
    const agentWallet = (await reader.readContract({
      address: identityRegistry,
      abi: ERC8004_IDENTITY_ABI,
      functionName: "getAgentWallet",
      args: [BigInt(agentId)],
    })) as Address;
    if (!isAddress(agentWallet) || agentWallet === ZERO) {
      throw new Error(`Agent #${agentId} has no signing wallet set.`);
    }

    const allowance = (await reader.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [agentWallet, facilitator],
    })) as bigint;
    if (allowance >= value) {
      return NextResponse.json(
        { status: "sufficient", agentWallet },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { account, walletClient, publicClient } = await turnkeyClients(agentWallet, chainId);
    const txHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [facilitator, value],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return NextResponse.json(
      { status: "approved", txHash, agentWallet },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Turnkey approve failed." },
      { status: 502 },
    );
  }
}
