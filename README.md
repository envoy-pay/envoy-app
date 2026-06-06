# envoy-app

The Envoy product UI — mint an ERC-8004 agent, fund it, and watch it pay
autonomously on Celo.

Built with Next.js. It consumes the [`envoy-pay`](https://github.com/envoy-pay/envoy-pay)
SDK for on-chain settlement (`EnvoyFacilitator`), ERC-8004 identity, and
payment-request URIs; [Turnkey](https://turnkey.com) for non-custodial agent
wallets; and Stripe for fiat settlement.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

Needs `envoy-pay` (from npm) plus the env vars documented in `.env.example`
(Turnkey, Stripe, Celo RPC, and the deployed `EnvoyFacilitator` address).

## Part of Envoy

| Repo | Role |
|---|---|
| [`envoy-pay`](https://github.com/envoy-pay/envoy-pay) | SDK + Solidity contracts — the open, on-chain infrastructure |
| **`envoy-app`** | This product UI |

## License

Apache-2.0
