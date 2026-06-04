/**
 * Server-only Turnkey helpers — the TEE-backed custody mode for /create.
 *
 * IMPORTANT: never import this from a client component. It reads server-only
 * secrets (TURNKEY_API_PRIVATE_KEY) and pulls the Turnkey server SDK. It is used
 * exclusively by the route handlers under app/api/turnkey/*.
 *
 * Model: the agent's signing key is generated inside Turnkey's secure enclave
 * (non-exportable) and signs EIP-712 payloads via API. The raw key never reaches
 * the browser or this server — we only ever see the public address + a signature.
 * Turnkey is curve-based (secp256k1), so the resulting signature is a standard
 * EIP-712 signature that Celo verifies natively; Turnkey itself is chain-agnostic.
 */
import { Turnkey } from "@turnkey/sdk-server";
import { createAccount } from "@turnkey/viem";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { celo, celoSepolia } from "viem/chains";
import { getCeloChain } from "./chains";

const BASE_URL = process.env.TURNKEY_API_BASE_URL ?? "https://api.turnkey.com";

/** True only when all three server-side Turnkey credentials are present. */
export function turnkeyConfigured(): boolean {
  return Boolean(
    process.env.TURNKEY_API_PUBLIC_KEY &&
      process.env.TURNKEY_API_PRIVATE_KEY &&
      process.env.TURNKEY_ORGANIZATION_ID,
  );
}

function organizationId(): string {
  const id = process.env.TURNKEY_ORGANIZATION_ID;
  if (!id) throw new Error("Turnkey not configured");
  return id;
}

function apiClient() {
  if (!turnkeyConfigured()) throw new Error("Turnkey not configured");
  const turnkey = new Turnkey({
    apiBaseUrl: BASE_URL,
    apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY!,
    apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY!,
    defaultOrganizationId: organizationId(),
  });
  return turnkey.apiClient();
}

/** Create a fresh, non-exportable Ethereum signing key inside the enclave. */
export async function provisionAgentWallet(
  label: string,
): Promise<{ address: Address; walletId: string }> {
  const res = await apiClient().createWallet({
    walletName: label,
    accounts: [
      {
        curve: "CURVE_SECP256K1",
        pathFormat: "PATH_FORMAT_BIP32",
        path: "m/44'/60'/0'/0/0",
        addressFormat: "ADDRESS_FORMAT_ETHEREUM",
      },
    ],
  });
  const address = res.addresses?.[0] as Address | undefined;
  if (!address) throw new Error("Turnkey createWallet returned no address");
  return { address, walletId: res.walletId };
}

/**
 * Sign an EIP-712 typed-data payload with the enclave key behind `signWith`.
 * `signWith` must be an address Turnkey controls in this org, or it errors —
 * which is what keeps this from signing for keys we don't own.
 */
export async function signTypedDataWithTurnkey(
  signWith: Address,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typedData: any,
): Promise<`0x${string}`> {
  const account = await createAccount({
    client: apiClient(),
    organizationId: organizationId(),
    signWith,
    ethereumAddress: signWith,
  });
  return account.signTypedData(typedData);
}

function viemChain(chainId: number) {
  if (chainId === celo.id) return celo;
  if (chainId === celoSepolia.id) return celoSepolia;
  throw new Error(`Unsupported chainId ${chainId}`);
}

/** A read-only Celo client (no key) for resolving wallets, limits, allowances. */
export function celoPublicClient(chainId: number) {
  return createPublicClient({
    chain: viemChain(chainId),
    transport: http(getCeloChain(chainId).rpcUrl),
  });
}

/**
 * Build the trio needed to act AS the enclave agent on Celo: a viem account that
 * signs (typed data + transactions) inside Turnkey, a walletClient to broadcast
 * its transactions (approve / pay), and a publicClient for reads + receipts.
 * The agent wallet pays its own gas, so it must hold a little CELO.
 */
export async function turnkeyClients(signWith: Address, chainId: number) {
  const account = await createAccount({
    client: apiClient(),
    organizationId: organizationId(),
    signWith,
    ethereumAddress: signWith,
  });
  const chain = viemChain(chainId);
  const rpcUrl = getCeloChain(chainId).rpcUrl;
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  return { account, walletClient, publicClient };
}
