import { NextResponse } from "next/server";

const CIRCLE_BASE_URL = process.env.NEXT_PUBLIC_CIRCLE_BASE_URL ?? "https://api.circle.com";
const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY as string;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...params } = body ?? {};

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    switch (action) {
      case "createDeviceToken": {
        const { deviceId } = params;
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/users/social/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}` },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId }),
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "initializeUser": {
        const { userToken } = params;
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/initialize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), accountType: "SCA", blockchains: ["ARC-TESTNET"] }),
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "listWallets": {
        const { userToken } = params;
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets`, {
          method: "GET",
          headers: { accept: "application/json", "content-type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "getTokenBalance": {
        const { userToken, walletId } = params;
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets/${walletId}/balances`, {
          method: "GET",
          headers: { accept: "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "sendTransaction": {
        const { userToken, walletId, destinationAddress, amount } = params;
        const balRes = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets/${walletId}/balances`, {
          headers: { accept: "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        });
        const balData = await balRes.json();
        const tokenId = balData?.data?.tokenBalances?.[0]?.token?.id;
        if (!tokenId) return NextResponse.json({ error: "No token found in wallet" }, { status: 400 });
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/transactions/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            walletId,
            destinationAddress,
            amounts: [amount],
            feeLevel: "MEDIUM",
            tokenId,
          }),
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "getTransferChallenge": {
        const { userToken, walletId, destinationAddress, amount } = params;
        const balRes = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/wallets/${walletId}/balances`, {
          headers: { accept: "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        });
        const balData = await balRes.json();
        const tokenId = balData?.data?.tokenBalances?.[0]?.token?.id;
        if (!tokenId) return NextResponse.json({ error: "No token found in wallet" }, { status: 400 });
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/user/transactions/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
          body: JSON.stringify({
            idempotencyKey: crypto.randomUUID(),
            walletId,
            destinationAddress,
            amounts: [amount],
            feeLevel: "MEDIUM",
            tokenId,
          }),
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "getTransactions": {
        const { userToken, walletId } = params;
        const response = await fetch(`${CIRCLE_BASE_URL}/v1/w3s/transactions?walletIds=${walletId}&pageSize=20`, {
          method: "GET",
          headers: { accept: "application/json", Authorization: `Bearer ${CIRCLE_API_KEY}`, "X-User-Token": userToken },
        });
        const data = await response.json();
        if (!response.ok) return NextResponse.json(data, { status: response.status });
        return NextResponse.json(data.data, { status: 200 });
      }
      case "askAI": {
        const { message, balance, blockchain } = params;
        const msg = message.toLowerCase();
        let reply = "";
        if (msg.includes("balance") || msg.includes("баланс")) {
          reply = `Your current USDC balance is ${balance} on ${blockchain}. You can send, receive or stake your tokens!`;
        } else if (msg.includes("send") || msg.includes("отправить") || msg.includes("отправь")) {
          reply = "To send USDC, go to the Send tab, enter the recipient address and amount, then confirm with your Google account. Transactions are fast on Arc Testnet!";
        } else if (msg.includes("stake") || msg.includes("garden") || msg.includes("стейк") || msg.includes("сад")) {
          reply = "In the Garden tab you can stake your USDC! Plant seeds and watch them grow. Seeds evolve: 🌱 Day 1 → 🌿 Day 3 → 🌸 Day 7 → 🌳 Day 14. Harvest anytime!";
        } else if (msg.includes("swap") || msg.includes("свап") || msg.includes("обменять")) {
          reply = "You can swap USDC ↔ EURC in the Swap tab! Rate: 1 USDC = 0.92 EURC or 1 EURC = 1.09 USDC.";
        } else if (msg.includes("faucet") || msg.includes("токен") || msg.includes("free") || msg.includes("бесплатн")) {
          reply = "Need testnet USDC? Visit faucet.circle.com and enter your wallet address to get free test tokens on Arc Testnet!";
        } else if (msg.includes("arc") ) {
          reply = "Arc is a high-performance blockchain built for stablecoin payments. HashCrew is built on Arc Testnet using Circle's USDC. Arc is designed for fast, cheap transactions perfect for everyday payments!";
        } else if (msg.includes("usdc")) {
          reply = "USDC is a stablecoin pegged 1:1 to the US dollar, issued by Circle. On Arc Testnet you can send, receive, stake and swap USDC for free using test tokens!";
        } else if (msg.includes("hello") || msg.includes("hi") || msg.includes("привет") || msg.includes("хай")) {
          reply = `Hello! 👋 I'm HashCrew AI, your Web3 assistant. Your balance is ${balance} USDC on ${blockchain}. How can I help you today?`;
        } else if (msg.includes("help") || msg.includes("помог") || msg.includes("что умеешь")) {
          reply = "I can help you with: check balance, send USDC, staking in Garden, swap USDC to EURC, get testnet tokens, and learn about Arc blockchain. Just ask!";;
        } else {
          reply = `Great question! I'm HashCrew AI here to help you navigate Web3 on Arc Testnet. Your balance is ${balance} USDC. Try asking me about sending, staking, swapping, or the Arc blockchain!`;
        }
        return NextResponse.json({ reply }, { status: 200 });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
