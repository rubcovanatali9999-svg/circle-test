"use client";

import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, formatUnits, maxUint256 } from "viem";
import { arcTestnet } from "./wagmi";
import { ARC_USDC_ADDRESS, ARC_USDC_DECIMALS } from "./useEvmWallet";

export const STAKING_ADDRESS = "0x5161d45d48aa0e5e75445163c35fe6bb3cf3b523" as const;
export const MIN_STAKE_USDC = 1;

export enum LockType { FLEXIBLE = 0, DAYS_7 = 1, DAYS_30 = 2, DAYS_90 = 3 }

export const LOCK_LABELS: Record<LockType, string> = {
  [LockType.FLEXIBLE]: "Flexible", [LockType.DAYS_7]: "7 Days",
  [LockType.DAYS_30]: "30 Days", [LockType.DAYS_90]: "90 Days",
};
export const LOCK_MULTIPLIERS: Record<LockType, string> = {
  [LockType.FLEXIBLE]: "1.00x", [LockType.DAYS_7]: "1.25x",
  [LockType.DAYS_30]: "1.75x", [LockType.DAYS_90]: "3.00x",
};
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

const erc20ApproveAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export function useStaking() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const [stakeMsg, setStakeMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [staking, setStaking] = useState(false);
  const [unstaking, setUnstaking] = useState<number | null>(null);

  const { data: positionCount, refetch: refetchCount } = useReadContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "positionCount", args: address ? [address] : undefined, chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 15000 } });
  const { data: totalPointsRaw, refetch: refetchPoints } = useReadContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalPoints", args: address ? [address] : undefined, chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 15000 } });
  const { data: stakerCount, refetch: refetchStakerCount } = useReadContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "stakerCount", chainId: arcTestnet.id, query: { refetchInterval: 30000 } });
  const { data: totalStakedRaw } = useReadContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "totalStaked", chainId: arcTestnet.id, query: { refetchInterval: 30000 } });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({ address: ARC_USDC_ADDRESS, abi: erc20ApproveAbi, functionName: "allowance", args: address ? [address, STAKING_ADDRESS] : undefined, chainId: arcTestnet.id, query: { enabled: !!address, refetchInterval: 15000 } });
  const { writeContractAsync } = useWriteContract();

  const refetchAll = useCallback(() => {
    void refetchCount(); void refetchPoints(); void refetchStakerCount(); void refetchAllowance();
  }, [refetchCount, refetchPoints, refetchStakerCount, refetchAllowance]);

  const loadPositions = useCallback(async (): Promise<(Position & { idx: number })[]> => {
    if (!address || !publicClient || !positionCount) return [];
    const count = Number(positionCount);
    if (count === 0) return [];
    const results: (Position & { idx: number })[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const raw = await publicClient.readContract({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "getPosition", args: [address, BigInt(i)] });
        const pos = raw as any;
        results.push({ idx: i, amount: BigInt(pos.amount), stakedAt: BigInt(pos.stakedAt), unlockAt: BigInt(pos.unlockAt), lockType: pos.lockType as LockType, active: pos.active });
      } catch { /* skip */ }
    }
    return results;
  }, [address, publicClient, positionCount]);

  const stakeUsdc = useCallback(async (amountStr: string, lockType: LockType) => {
    if (!address) throw new Error("Wallet not connected");
    const amount = parseUnits(amountStr, ARC_USDC_DECIMALS);
    setStaking(true); setStakeMsg(null);
    try {
      const currentAllowance = (allowanceRaw as bigint) ?? 0n;
      if (currentAllowance < amount) {
        setStakeMsg({ type: "ok", text: "Approving USDC spend... confirm in wallet" });
        await writeContractAsync({ address: ARC_USDC_ADDRESS, abi: erc20ApproveAbi, functionName: "approve", args: [STAKING_ADDRESS, maxUint256], chainId: arcTestnet.id });
        await refetchAllowance();
      }
      setStakeMsg({ type: "ok", text: "Staking... confirm in wallet" });
      await writeContractAsync({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "stake", args: [amount, lockType], chainId: arcTestnet.id });
      setStakeMsg({ type: "ok", text: `Staked ${amountStr} USDC!` });
      refetchAll();
    } catch (err: any) {
      setStakeMsg({ type: "err", text: err?.shortMessage || err?.message || "Stake failed" });
      throw err;
    } finally { setStaking(false); }
  }, [address, allowanceRaw, writeContractAsync, refetchAllowance, refetchAll]);

  const unstakePosition = useCallback(async (positionIdx: number) => {
    if (!address) throw new Error("Wallet not connected");
    setUnstaking(positionIdx); setStakeMsg(null);
    try {
      await writeContractAsync({ address: STAKING_ADDRESS, abi: stakingAbi, functionName: "unstake", args: [BigInt(positionIdx)], chainId: arcTestnet.id });
      setStakeMsg({ type: "ok", text: "Unstaked successfully!" });
      refetchAll();
    } catch (err: any) {
      setStakeMsg({ type: "err", text: err?.shortMessage || err?.message || "Unstake failed" });
      throw err;
    } finally { setUnstaking(null); }
  }, [address, writeContractAsync, refetchAll]);

  return {
    staking, unstaking, stakeMsg, setStakeMsg,
    positionCount: positionCount ? Number(positionCount) : 0,
    totalPoints: totalPointsRaw ? Number(formatUnits(totalPointsRaw as bigint, 0)) : 0,
    stakerCount: stakerCount ? Number(stakerCount) : 0,
    totalStaked: totalStakedRaw ? formatUnits(totalStakedRaw as bigint, ARC_USDC_DECIMALS) : "0",
    loadPositions, stakeUsdc, unstakePosition, refetchAll,
  };
}
