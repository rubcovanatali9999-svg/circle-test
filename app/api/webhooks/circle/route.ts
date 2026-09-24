import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { notificationType, notification } = body;

    console.log("Circle webhook:", notificationType);

    switch (notificationType) {
      case "modularWallet.inboundTransfer": {
        const tx = notification?.transfer;
        console.log("Inbound transfer:", tx?.amounts, tx?.walletAddress);
        break;
      }
      case "modularWallet.outboundTransfer": {
        const tx = notification?.transfer;
        console.log("Outbound transfer:", tx?.amounts, tx?.walletAddress);
        break;
      }
      case "modularWallet.userOperation": {
        console.log("User operation:", notification?.state);
        break;
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "HashCrew webhooks" });
}
