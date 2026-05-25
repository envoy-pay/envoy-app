import { NextRequest } from "next/server";
import { createEvmWatcher } from "envoy-pay";
import { DEFAULT_CHAIN_ID, getCeloChain, type AssetKey } from "@/lib/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { wallet: string } },
) {
  const url = new URL(req.url);
  const chainId = url.searchParams.get("chain")
    ? Number(url.searchParams.get("chain"))
    : DEFAULT_CHAIN_ID;
  const asset = (url.searchParams.get("asset") as AssetKey) ?? "cUSD";

  const chain = getCeloChain(chainId);
  const tokenAddress = chain.assets[asset]?.address;
  if (!tokenAddress) {
    return new Response(`Unsupported asset: ${asset}`, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("open", {
        wallet: params.wallet,
        chainId,
        asset,
        chain: chain.shortName,
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      const unsubscribe = createEvmWatcher({
        address: params.wallet,
        rpcUrl: chain.rpcUrl,
        chainId: `eip155:${chainId}`,
        chainName: chain.shortName,
        usdcContractAddress: tokenAddress,
        pollIntervalMs: 5000,
        onPayment: (payment) => {
          send("payment", {
            amount: payment.amount,
            amountFormatted: payment.amountFormatted,
            asset: payment.asset === "USDC" ? asset : payment.asset,
            from: payment.from,
            transactionHash: payment.transactionHash,
            chain: payment.chain,
            timestamp: payment.timestamp.toISOString(),
          });
        },
        onError: (err) => {
          send("error", { message: err.message });
        },
      });

      const close = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
