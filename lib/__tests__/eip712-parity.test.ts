import { describe, it, expect } from 'vitest';
import { hashTypedData } from 'viem';
import { agentWalletSetTypedData } from '../abi';
import { agentWalletRotationTypedData } from 'envoy-pay/identity';

// envoy-app vendors a client-safe copy of the AgentWalletSet EIP-712 builder in
// lib/abi.ts, because the browser bundle can't include the SDK's native OWS
// dependency. This test pins that copy against the published envoy-pay SDK: if the
// two ever drift, the setAgentWallet signatures minted on /create would be rejected
// on-chain by the canonical ERC-8004 Identity Registry.
//
// Runs once `envoy-pay` is installed (i.e. published to npm). Verified equal at
// `0x48bff1c1…08f6ea` against the local SDK build during the repo split.
describe('AgentWalletSet EIP-712 parity (envoy-app ↔ envoy-pay)', () => {
  const registry = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`;
  const base = {
    chainId: 42220, // Celo Mainnet
    agentId: 128n,
    newWallet: '0x2222222222222222222222222222222222222222' as `0x${string}`,
    owner: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    deadline: 1_900_000_000n,
  };

  it('hashes identically to the SDK builder', () => {
    const web = agentWalletSetTypedData({ ...base, registry });
    const sdk = agentWalletRotationTypedData({ ...base, registryAddress: registry });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(hashTypedData(web as any)).toBe(hashTypedData(sdk as any));
  });
});
