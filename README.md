# HashCrew — Web3 Wallet on Arc

**Built on Arc · Powered by Circle**

Live: [hashcrewtest.vercel.app](https://hashcrewtest.vercel.app)

A full-featured Web3 wallet on Arc Testnet. Two ways in: Google OAuth (Circle SDK, no seed phrase) or MetaMask (self-custody). Same balance, same features, either way.

---

## Features

| Feature | Description |
|---|---|
| Google OAuth Login | Circle Modular Wallets SDK — no seed phrase |
| MetaMask Login | Self-custodial, real on-chain balance |
| Send USDC | Real on-chain transactions on Arc |
| CCTP Bridge | Move USDC across 7 chains via Circle Bridge Kit |
| On-chain Staking | Lock USDC for Flexible / 7 / 30 / 90 days, earn points |
| Watch List | Monitor any wallet address — balance + tx count |
| NFT Badges | Real ERC-721 achievements minted on Arc |
| AI Assistant | Natural-language Web3 assistant powered by Claude |
| Circle Webhooks | Real-time transaction sync (no polling) |
| Analytics | Balance history with charts |

---

## Smart Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| HashCrew Badges (ERC-721) | 0xb3d1...3800 |
| HashCrew Staking | 0xd76e91cbbf751052ee2b11b5a1d0880e4659621c |

Staking contract: 67/67 security tests passed.

---

## Circle Products Used

- Circle Modular Wallets SDK — Google OAuth wallet creation
- Circle Bridge Kit (CCTP) — Cross-chain USDC transfers
- Circle Webhooks — Real-time transaction notifications
- USDC on Arc — Native gas token and payment rail

---

## Tech Stack

Next.js 16 · TypeScript · React · wagmi + viem · Solidity · Foundry · Vercel

---

Built with love for the Arc ecosystem by Natali Rubtsova
