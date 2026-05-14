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
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
