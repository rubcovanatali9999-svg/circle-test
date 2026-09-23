"use client";

import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, maxUint256, encodeFunctionData } from "viem";
import { arcTestnet } from "./wagmi";
import { ARC_USDC_ADDRESS, ARC_USDC_DECIMALS } from "./useEvmWallet";

export const STAKING_ADDRESS = "0x5161d45d48aa0e5e75445163c35fe6bb3cf3b523" as const;
export const MIN_STAKE_USDC = 1;
export enum LockType { FLEXIBLE = 0, DAYS_7 = 1, DAYS_30 = 2, DAYS_90 = 3 }
export const LOCK_LABELS: Record<LockType, string> = { [LockType.FLEXIBLE]: "Flexible", [LockType.DAYS_7]: "7 Days", [LockType.DAYS_30]: "30 Days", [LockType.DAYS_90]: "90 Days" };
export const LOCK_MULTIPLIERS: Record<LockType, string> = { [LockType.FLEXIBLE]: "1.00x", [LockType.DAYS_7]: "1.25x", [LockType.DAYS_30]: "1.75x", [LockType.DAYS_90]: "3.00x" };
export type Position = { amount: bigint; stakedAt: bigint; unlockAt: bigint; lockType: LockType; active: boolean };

const stakingAbi = [
  { type: "function", name: "stake", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }, { name: "lockType", type: "uint8" }], outputs: [] },
  { type: "function", name: "unstake", stateMutability: "nonpayable", inputs: [{ name: "positionIdx", type: "uint256" }], outputs: [] },
  { type: "function", name: "positionCount", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "getPosition", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "idx", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "amount", type: "uint128" }, { name: "stakedAt", type: "uint64" }, { name: "unlockAt", type: "uint64" }, { name: "lockType", type: "uint8" }, { name: "active", type: "bool" }] }] },
  { type: "function", name: "totalPoints", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "stakerCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalStaked", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export function useStaking() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const { data: walletClient } = useWalletClient({ chainId: arcTestnet.id });

  const [stakeMsg, setStakeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [staking, setStaking] = useState(false);
  const [unstaking, setUnstaking] = useState<number | null>(null);
  const [stakerCount, setStakerCount] = useState<number>(0);
  const [totalStaked, setTotalStaked] = useState<string>("0");

  const refreshStats = useCallback(async () => {
    if (!publicClient) return;
    try {
      const [sc, ts] = await Promise.all([
        publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "stakerCount" }),
        publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalStaked" }),
      ]);
      setStakerCount(Number(sc));
      setTotalStaked(formatUnits(ts as bigint, ARC_USDC_DECIMALS));
    } catch {}
  }, [publicClient]);

  const loadPositions = useCallback(async (): Promise<(Position & { idx: number })[]> => {
    if (!address || !publicClient) return [];
    try {
      const count = await publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positionCount", args: [address] });
      const n = Number(count);
      if (n === 0) return [];
      const results: (Position & { idx: number })[] = [];
      for (let i = 0; i < n; i++) {
        try {
          const raw = await publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "getPosition", args: [address, BigInt(i)] }) as any;
          results.push({ idx: i, amount: BigInt(raw.amount), stakedAt: BigInt(raw.stakedAt), unlockAt: BigInt(raw.unlockAt), lockType: raw.lockType as LockType, active: raw.active });
        } catch {}
      }
      return results;
    } catch { return []; }
  }, [address, publicClient]);

  const getTotalPoints = useCallback(async (): Promise<number> => {
    if (!address || !publicClient) return 0;
    try {
      const pts = await publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalPoints", args: [address] });
      return Number(pts);
    } catch { return 0; }
  }, [address, publicClient]);

  const stakeUsdc = useCallback(async (amountStr: string, lockType: LockType) => {
    if (!address || !walletClient || !publicClient) throw new Error("Wallet not connected");
    const amount = parseUnits(amountStr, ARC_USDC_DECIMALS);
    setStaking(true);
    setStakeMsg(null);
    try {
      // 1. check allowance
      const allowance = await publicClient.readContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [address, STAKING_ADDRESS] }) as bigint;
      if (allowance < amount) {
        setStakeMsg({ type: "ok", text: "Step 1/2: Approve USDC — confirm in MetaMask" });
        const approveTx = await walletClient.writeContract({ address: ARC_USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [STAKING_ADDRESS, maxUint256], chain: arcTestnet, account: address });
        setStakeMsg({ type: "ok", text: "Waiting for approve confirmation..." });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        setStakeMsg({ type: "ok", text: "Approved! Step 2/2: Stake — confirm in MetaMask" });
      } else {
        setStakeMsg({ type: "ok", text: "Staking — confirm in MetaMask" });
      }
      const stakeTx = await walletClient.writeContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "stake", args: [amount, lockType], chain: arcTestnet, account: address });
      setStakeMsg({ type: "ok", text: "Waiting for stake confirmation..." });
      await publicClient.waitForTransactionReceipt({ hash: stakeTx });
      setStakeMsg({ type: "ok", text: `Staked ${amountStr} USDC successfully!` });
      await refreshStats();
    } catch (err: any) {
      setStakeMsg({ type: "err", text: err?.shortMessage || err?.message || "Stake failed" });
      throw err;
    } finally { setStaking(false); }
  }, [address, walletClient, publicClient, refreshStats]);

  const unstakePosition = useCallback(async (positionIdx: number) => {
    if (!address || !walletClient || !publicClient) throw new Error("Wallet not connected");
    setUnstaking(positionIdx);
    setStakeMsg(null);
    try {
      const tx = await walletClient.writeContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "unstake", args: [BigInt(positionIdx)], chain: arcTestnet, account: address });
      setStakeMsg({ type: "ok", text: "Waiting for unstake confirmation..." });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      setStakeMsg({ type: "ok", text: "Unstaked successfully!" });
      await refreshStats();
    } catch (err: any) {
      setStakeMsg({ type: "err", text: err?.shortMessage || err?.message || "Unstake failed" });
      throw err;
    } finally { setUnstaking(null); }
  }, [address, walletClient, publicClient, refreshStats]);

  return {
    staking, unstaking, stakeMsg, setStakeMsg,
    stakerCount, totalStaked, getTotalPoints,
    loadPositions, stakeUsdc, unstakePosition, refreshStats,
    positionCount: 0,
    totalPoints: 0,
    refetchAll: refreshStats,
  };
}
