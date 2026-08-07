"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { arcTestnet } from "./wagmi";

export default function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const isArc = chain?.id === arcTestnet.id;

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (isConnected && address) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: "#fff",
            border: "1px solid #e5e3ed",
            color: "#1b1464",
            borderRadius: 10,
            padding: "8px 13px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: isArc ? "#2e7d32" : "#f59e0b",
            }}
          />

          {address.slice(0, 6)}...{address.slice(-4)}

          <span style={{ fontSize: 10 }}>⌄</span>
        </button>

        {open && (
          <div
            ref={modalRef}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 290,
              background: "#fff",
              border: "1px solid #e5e3ed",
              borderRadius: 14,
              padding: 16,
              boxShadow: "0 12px 35px rgba(27,20,100,0.14)",
              zIndex: 100,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#999",
                textTransform: "uppercase",
                letterSpacing: ".07em",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Connected wallet
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a2e",
                marginBottom: 4,
              }}
            >
              {address.slice(0, 10)}...{address.slice(-8)}
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#888",
                marginBottom: 16,
              }}
            >
              Current network: {chain?.name ?? "Unknown"}
            </div>

            {!isArc && (
              <div
                style={{
                  background: "#fff7e6",
                  border: "1px solid #f4d7a1",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#8a5a00",
                    marginBottom: 5,
                  }}
                >
                  Wrong network
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "#99733a",
                    lineHeight: 1.5,
                    marginBottom: 10,
                  }}
                >
                  HashCrew runs on Arc Testnet. Switch your wallet to continue.
                </div>

                <button
                  disabled={isSwitching}
                  onClick={() => switchChain({ chainId: arcTestnet.id })}
                  style={{
                    width: "100%",
                    background: "#1b1464",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    padding: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: isSwitching ? "wait" : "pointer",
                    opacity: isSwitching ? 0.7 : 1,
                  }}
                >
                  {isSwitching
                    ? "Switching..."
                    : "Switch to Arc Testnet"}
                </button>
              </div>
            )}

            {isArc && (
              <div
                style={{
                  background: "#e8f5e9",
                  color: "#2e7d32",
                  borderRadius: 10,
                  padding: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                ✓ Connected to Arc Testnet
              </div>
            )}

            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              style={{
                width: "100%",
                background: "#fce8e8",
                color: "#c62828",
                border: "none",
                borderRadius: 9,
                padding: 10,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isPending}
        style={{
          background: "#1b1464",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "9px 15px",
          fontSize: 12,
          fontWeight: 700,
          cursor: isPending ? "wait" : "pointer",
          opacity: isPending ? 0.7 : 1,
          boxShadow: "0 4px 12px rgba(27,20,100,0.18)",
        }}
      >
        {isPending ? "Connecting..." : "Connect Wallet"}
      </button>

      {open && (
        <div
          ref={modalRef}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 300,
            background: "#fff",
            border: "1px solid #e5e3ed",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 15px 40px rgba(27,20,100,0.16)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 5,
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "#1a1a2e",
              }}
            >
              Connect wallet
            </div>

            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#999",
                fontSize: 20,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "#999",
              marginBottom: 16,
            }}
          >
            Choose an EVM wallet
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#aaa",
              textTransform: "uppercase",
              letterSpacing: ".07em",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Available wallets
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                disabled={isPending}
                onClick={() => connect({ connector })}
                style={{
                  width: "100%",
                  background: "#f8f7fc",
                  border: "1px solid #e5e3ed",
                  borderRadius: 10,
                  padding: "11px 12px",
                  color: "#1a1a2e",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isPending ? "wait" : "pointer",
                  textAlign: "left",
                }}
              >
                {connector.name}
              </button>
            ))}
          </div>

          {connectors.length === 0 && (
            <div
              style={{
                padding: 12,
                background: "#f8f7fc",
                borderRadius: 10,
                fontSize: 12,
                color: "#888",
                lineHeight: 1.5,
              }}
            >
              No EVM wallet detected in this browser.
            </div>
          )}

          <div
            style={{
              fontSize: 10,
              color: "#aaa",
              marginTop: 14,
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            Your wallet stays in your control.
            <br />
            HashCrew never asks for your recovery phrase.
          </div>
        </div>
      )}
    </div>
  );
}
