# HashCrew

A Web3 wallet on **Arc Testnet** (Circle's stablecoin-native Layer-1) with two ways in — social login with no seed phrase, or full self-custody with your own wallet — both backed by real on-chain balances, transfers, and history.

🌐 **Live demo:** [hashcrewtest.vercel.app](https://hashcrewtest.vercel.app)

---

## What it does

**Two login modes, one wallet experience**
- **Continue with Google** — creates a Circle-managed wallet via the Circle User-Controlled Wallets SDK. No seed phrase, no browser extension.
- **Connect a wallet** — MetaMask, Rabby, or any injected EVM wallet, for people who already hold their own keys. Balance, send, and history are all read directly from the Arc Testnet blockchain in this mode (no Circle API involved).

**Send & receive USDC**
Real on-chain USDC transfers on Arc Testnet, with a Quick Send/Receive panel right on the dashboard.

**CCTP Bridge**
Move USDC between Arc Testnet and other EVM testnets (Ethereum Sepolia, Base Sepolia, Avalanche Fuji, Arbitrum Sepolia, OP Sepolia, Polygon Amoy) using Circle's [Bridge Kit](https://developers.circle.com/bridge-kit) — native burn-and-mint via CCTP, no wrapped tokens. Live step-by-step progress (approve → burn → attestation → mint) shown in the UI.

**On-chain NFT achievement badges**
A real ERC-721 contract ([`HashCrewBadges`](https://testnet.arcscan.app/address/0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800)), fully on-chain — artwork and metadata are generated inside the contract itself as base64-encoded SVG, with no external hosting or IPFS. Users mint their own badge once they hit a real, verifiable milestone (first send, first receive, bridged via CCTP, holding 100+ USDC).

**AI Assistant**
Natural-language commands (powered by Claude) that parse intent and pre-fill the send form — "send 5 USDC to 0x..." fills in the recipient and amount for you to confirm.

**Treasury Management & Staking Garden**
Automation rules and a gamified staking visualization, running on local state for now.

**Analytics**
Balance history chart on the dashboard.

**Arc House**
Live content feed from Circle's Arc builder community.

---

## Tech stack

- **Framework:** Next.js 16, TypeScript, React 19
- **Wallets:** Circle User-Controlled Wallets SDK (`@circle-fin/w3s-pw-web-sdk`) for social login, [wagmi](https://wagmi.sh) + [viem](https://viem.sh) for MetaMask/EVM wallets
- **Cross-chain:** [Circle Bridge Kit](https://developers.circle.com/bridge-kit) (`@circle-fin/bridge-kit`) for CCTP bridging
- **Smart contracts:** Solidity, OpenZeppelin ERC-721, deployed on Arc Testnet
- **Chain:** [Arc Testnet](https://docs.arc.io) — Circle's EVM-compatible L1 with USDC as native gas
- **Deployment:** Vercel

## Deployed contracts

| Contract | Address | Explorer |
|---|---|---|
| HashCrewBadges (ERC-721) | `0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800` | [ArcScan ↗](https://testnet.arcscan.app/address/0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800) |

## Getting started

```bash
git clone https://github.com/rubcovanatali9999-svg/circle-test.git
cd circle-test
npm install
```

Create a `.env.local` with:

```
NEXT_PUBLIC_CIRCLE_APP_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
```

Then:

```bash
npm run dev
```

---

Built for the Arc / Circle ecosystem, by Natali Rubtsova.
