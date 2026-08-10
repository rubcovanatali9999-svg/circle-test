"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { arcTestnet } from "./wagmi";

// Deployed on Arc Testnet via Remix on 2026-08-10.
// View on ArcScan: https://testnet.arcscan.app/address/0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800
export const BADGES_CONTRACT_ADDRESS = "0xb3d15388Ce100Ae18937CFFfdADcec7D6b523800" as const;

export const BADGES_ABI = [
  { inputs: [{ internalType: "uint256", name: "badgeId", type: "uint256" }], name: "mintBadge", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }, { internalType: "uint256", name: "badgeId", type: "uint256" }], name: "hasBadge", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "owner", type: "address" }], name: "balanceOf", outputs: [{ internalType: "uint256", name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export type BadgeDef = { id: number; title: string; desc: string; icon: string };

export const BADGES: BadgeDef[] = [
  { id: 0, title: "First Send", desc: "Sent USDC on Arc for the first time", icon: "💸" },
  { id: 1, title: "First Receive", desc: "Received USDC on Arc for the first time", icon: "📥" },
  { id: 2, title: "Bridge Explorer", desc: "Bridged USDC across chains via CCTP", icon: "🌉" },
  { id: 3, title: "Whale", desc: "Held 100+ USDC on Arc", icon: "🐋" },
];

/**
 * Reads which on-chain badges the connected EVM address has already minted from
 * HashCrewBadges (a real ERC-721 deployed on Arc Testnet), and lets the user mint
 * new ones. This is entirely separate from Circle's API — a genuine on-chain
 * NFT mint signed directly by the connected wallet.
 */
export function useBadges() {
  const { address } = useAccount();
  const [minted, setMinted] = useState<Record<number, boolean>>({});
  const [mintingId, setMintingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = useReadContracts({
    contracts: BADGES.map((b) => ({
      address: BADGES_CONTRACT_ADDRESS,
      abi: BADGES_ABI,
      functionName: "hasBadge" as const,
      args: address ? [address, BigInt(b.id)] : undefined,
      chainId: arcTestnet.id,
    })),
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<number, boolean> = {};
    data.forEach((r, i) => { next[BADGES[i].id] = r.status === "success" ? Boolean(r.result) : false; });
    setMinted(next);
  }, [data]);

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const { isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash, chainId: arcTestnet.id });

  useEffect(() => {
    if (confirmed) {
      refetch();
      setMintingId(null);
      setTxHash(undefined);
    }
  }, [confirmed, refetch]);

  const mint = useCallback(async (badgeId: number) => {
    setError(null);
    setMintingId(badgeId);
    try {
      const hash = await writeContractAsync({
        address: BADGES_CONTRACT_ADDRESS,
        abi: BADGES_ABI,
        functionName: "mintBadge",
        args: [BigInt(badgeId)],
        chainId: arcTestnet.id,
      });
      setTxHash(hash);
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Mint failed");
      setMintingId(null);
    }
  }, [writeContractAsync]);

  return { minted, mint, mintingId, error };
}
