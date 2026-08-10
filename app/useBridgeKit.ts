"use client";

import { useCallback, useRef, useState } from "react";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";

export type BridgeStepState = "pending" | "success" | "error" | string;

export type BridgeStep = {
  name: string;
  state: BridgeStepState;
  txHash?: string;
  explorerUrl?: string;
};

export type BridgeChainOption = { id: string; label: string };

// Testnet chains that support Bridge (CCTP), per Circle's App Kit docs
// (docs.arc.io/app-kit/references/supported-blockchains). Identifiers match
// the BridgeChain enum exported from @circle-fin/bridge-kit.
export const BRIDGE_TESTNET_CHAINS: BridgeChainOption[] = [
  { id: "Arc_Testnet", label: "Arc Testnet" },
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
  { id: "Base_Sepolia", label: "Base Sepolia" },
  { id: "Avalanche_Fuji", label: "Avalanche Fuji" },
  { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia" },
  { id: "Optimism_Sepolia", label: "OP Sepolia" },
  { id: "Polygon_Amoy_Testnet", label: "Polygon Amoy" },
];

/**
 * Bridges USDC between testnets using Circle's Bridge Kit (CCTP under the hood).
 * Runs entirely client-side against whatever EVM wallet is injected (e.g. MetaMask) —
 * no backend or API key needed, since Bridge Kit's viem adapter signs directly
 * through the browser wallet's provider.
 */
export function useBridgeKit() {
  const kitRef = useRef<BridgeKit | null>(null);
  const [steps, setSteps] = useState<BridgeStep[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getKit = () => {
    if (!kitRef.current) {
      const kit = new BridgeKit();
      kit.on("*", (payload: any) => {
        const name = payload?.values?.name ?? payload?.method ?? "step";
        const state: BridgeStepState = payload?.values?.state ?? "pending";
        const txHash = payload?.values?.txHash ?? payload?.values?.data?.txHash;
        const explorerUrl = payload?.values?.explorerUrl ?? payload?.values?.data?.explorerUrl;
        setSteps((prev) => {
          const idx = prev.findIndex((s) => s.name === name);
          const next: BridgeStep = { name, state, txHash, explorerUrl };
          if (idx === -1) return [...prev, next];
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...next };
          return copy;
        });
      });
      kitRef.current = kit;
    }
    return kitRef.current;
  };

  const runBridge = useCallback(async (fromChain: string, toChain: string, amount: string) => {
    setStatus("running");
    setErrorMsg(null);
    setSteps([]);
    try {
      const provider = (window as any).ethereum;
      if (!provider) throw new Error("No injected EVM wallet found (e.g. MetaMask).");
      const adapter = await createViemAdapterFromProvider({ provider });
      const kit = getKit();
      const result = await kit.bridge({
        from: { adapter, chain: fromChain as any },
        to: { adapter, chain: toChain as any },
        amount,
      });
      if ((result as any).state === "error") {
        setStatus("error");
        setErrorMsg("Bridge did not complete. Check the steps below and try again.");
      } else {
        setStatus("success");
      }
      return result;
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err?.shortMessage || err?.message || "Bridge failed");
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setSteps([]);
    setErrorMsg(null);
  }, []);

  return { runBridge, steps, status, errorMsg, reset };
}
