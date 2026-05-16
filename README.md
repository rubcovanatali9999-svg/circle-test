# HashCrew Arc Testnet Wallet 🚀

A full-featured Web3 wallet built on **Arc Testnet** using **Circle's USDC**, designed to showcase the power of stablecoin payments and agentic commerce.

🌐 **Live Demo**: https://circle-test-lilac.vercel.app

---

## What is this?

HashCrew is a next-generation Web3 wallet that combines real blockchain transactions with gamified DeFi experiences. Built for the Arc ecosystem, it demonstrates how everyday users can interact with stablecoins in a fun, intuitive way.

## Features

| Feature | Description |
|---------|-------------|
| 🔐 **Google OAuth Login** | Seamless social login using Circle's User Controlled Wallets SDK |
| 💸 **Send USDC** | Real on-chain transactions on Arc Testnet with SDK challenge confirmation |
| 🔄 **Swap USDC ↔ EURC** | Swap between USD and EUR stablecoins |
| 🌱 **Staking Garden** | Gamified staking — plant seeds and watch them grow over time |
| 📊 **Analytics** | Balance history with neon purple charts |
| 🏆 **Achievements** | Earn badges for sending, staking, swapping and more |
| 🤖 **AI Assistant** | Built-in Web3 assistant that knows your balance and helps with transactions |
| 📚 **Learn** | Curated content from Arc House community |
| 📜 **Transaction History** | Full history of all on-chain transactions |

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, React
- **Blockchain**: Arc Testnet (Circle)
- **Wallet SDK**: @circle-fin/w3s-pw-web-sdk
- **Auth**: Google OAuth via Circle Social Login
- **Tokens**: USDC, EURC
- **Deploy**: Vercel

## How it works

1. User signs in with Google → Circle creates a blockchain wallet
2. Wallet is tied to the user's Google account (no seed phrases!)
3. Transactions are confirmed via Circle's SDK challenge system
4. All data is stored on Arc Testnet blockchain

## Why Arc?

Arc is built for fast, cheap stablecoin payments — perfect for the agentic commerce future. HashCrew demonstrates how AI agents could one day manage wallets, make payments, and interact with DeFi protocols autonomously.

## Getting Started

```bash
git clone https://github.com/rubcovanatali9999-svg/circle-test
cd circle-test
npm install
cp .env.local.example .env.local
# Add your Circle API Key, Google Client ID, and Circle App ID
npm run dev
```

## Built by

Natali Rubtsova — [@rubcovanatali9999-svg](https://github.com/rubcovanatali9999-svg)

Built for the Arc ecosystem with ❤️
