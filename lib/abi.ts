/**
 * Client-safe ABI fragments + EIP-712 types, vendored from the `envoy-pay` SDK.
 *
 * We deliberately do NOT import the SDK into browser bundles — it pulls a native
 * binary (OWS) that can't run in the browser. These are the minimal fragments the
 * web app touches, kept in sync with `src/identity/erc8004/abis.ts` and
 * `src/contracts/abis/EnvoyFacilitator.ts`.
 */

import type { Address, Hex } from "viem";

// ── ERC-20 ──────────────────────────────────────────────────────────────────
export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ── ERC-8004 Identity Registry (subset) ──────────────────────────────────────
export const ERC8004_IDENTITY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isAuthorizedOrOwner",
    stateMutability: "view",
    inputs: [
      { name: "spender", type: "address" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    // Rotate the agent's operational signing wallet. `signature` is an EIP-712
    // `AgentWalletSet` produced by the *new* wallet (see agentWalletSetTypedData).
    type: "function",
    name: "setAgentWallet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unsetAgentWallet",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

// ── EnvoyFacilitator (subset) ────────────────────────────────────────────────
export const ENVOY_FACILITATOR_ABI = [
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getLimit",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "perTx", type: "uint128" },
          { name: "perPeriod", type: "uint128" },
          { name: "spentInPeriod", type: "uint128" },
          { name: "periodStart", type: "uint64" },
          { name: "periodLen", type: "uint32" },
          { name: "enabled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "setLimit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "token", type: "address" },
      { name: "perTx", type: "uint128" },
      { name: "perPeriod", type: "uint128" },
      { name: "periodLen", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "auth",
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "token", type: "address" },
          { name: "merchant", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "challengeId", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "challengeId", type: "bytes32", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
      { name: "signer", type: "address", indexed: false },
    ],
  },
] as const;

// ── EIP-712 — PaymentAuth (matches EnvoyFacilitator.sol) ──────────────────────
export interface PaymentAuth {
  agentId: bigint;
  token: Address;
  merchant: Address;
  amount: bigint;
  challengeId: Hex;
  nonce: bigint;
  deadline: bigint;
}

export const PAYMENT_AUTH_TYPES = {
  PaymentAuth: [
    { name: "agentId", type: "uint256" },
    { name: "token", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "challengeId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export function paymentAuthTypedData(args: {
  chainId: number;
  facilitator: Address;
  auth: PaymentAuth;
}) {
  return {
    domain: {
      name: "EnvoyFacilitator",
      version: "1",
      chainId: args.chainId,
      verifyingContract: args.facilitator,
    },
    types: PAYMENT_AUTH_TYPES,
    primaryType: "PaymentAuth" as const,
    message: args.auth,
  };
}

// ── EIP-712 — AgentWalletSet (matches the canonical ERC-8004 Identity Registry) ─
// The *new* signing wallet signs this to prove control of its key before the
// owner binds it via `setAgentWallet`. Mirrors `agentWalletRotationTypedData` in
// `src/identity/erc8004/identity.ts` — the registry's domain is
// `EIP712Domain("ERC8004IdentityRegistry","1",chainId,verifyingContract)`.
export const AGENT_WALLET_SET_TYPES = {
  AgentWalletSet: [
    { name: "agentId", type: "uint256" },
    { name: "newWallet", type: "address" },
    { name: "owner", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function agentWalletSetTypedData(args: {
  chainId: number;
  /** The canonical Identity Registry address for this chain. */
  registry: Address;
  agentId: bigint;
  /** The new agent signing wallet that will sign this payload. */
  newWallet: Address;
  /** Current ERC-721 owner of the agent NFT. */
  owner: Address;
  deadline: bigint;
}) {
  return {
    domain: {
      name: "ERC8004IdentityRegistry",
      version: "1",
      chainId: args.chainId,
      verifyingContract: args.registry,
    },
    types: AGENT_WALLET_SET_TYPES,
    primaryType: "AgentWalletSet" as const,
    message: {
      agentId: args.agentId,
      newWallet: args.newWallet,
      owner: args.owner,
      deadline: args.deadline,
    },
  };
}
