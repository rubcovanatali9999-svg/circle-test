"use client";

import { useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits, isAddress } from "viem";
import { arcTestnet } from "./wagmi";

// Official Arc Testnet USDC ERC-20 interface (source: docs.arc.io/arc/references/contract-addresses)
// Note: this is DIFFERENT from Arc's native gas balance, which uses 18 decimals.
// We always use the ERC-20 interface (6 decimals) for reading balances and sending transfers,
// as recommended by Circle's own docs, to stay consistent with USDC everywhere else (6 decimals).
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const ARC_USDC_DECIMALS = 6;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Reads USDC balance and sends USDC directly on-chain on Arc Testnet,
 * using whatever EVM wallet (MetaMask, etc.) is connected via wagmi.
 * This does NOT go through Circle's API — it's a plain self-custodial on-chain flow.
 */
export function useEvmWallet() {
  const { address, isConnected, chain } = useAccount();
  const isArc = chain?.id === arcTestnet.id;

  const {
    data: rawBalance,
    refetch: refetchBalance,
    isLoading: balanceLoading,
  } = useReadContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: {
      enabled: !!address && isConnected && isArc,
      refetchInterval: 15000,
    },
  });

  const balance = useMemo(() => {
    if (rawBalance === undefined) return "0";
    return formatUnits(rawBalance as bigint, ARC_USDC_DECIMALS);
  }, [rawBalance]);

  const {
    writeContractAsync,
    isPending: writePending,
    data: txHash,
  } = useWriteContract();

  const { isLoading: waitingForReceipt, isSuccess: txConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash, chainId: arcTestnet.id });

  /** Sends USDC to `to` on Arc Testnet. Throws on invalid input or if the user rejects/tx fails. */
  const sendUsdc = async (to: string, amount: string) => {
    if (!isAddress(to)) throw new Error("Invalid recipient address");
    if (!amount || Number.isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      throw new Error("Invalid amount");
    }
    const value = parseUnits(amount, ARC_USDC_DECIMALS);
    const hash = await writeContractAsync({
      address: ARC_USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to as `0x${string}`, value],
      chainId: arcTestnet.id,
    });
    return hash;
  };

  return {
    address,
    isConnected,
    isArc,
    chainName: chain?.name,
    balance,
    balanceLoading,
    refetchBalance,
    sendUsdc,
    sendPending: writePending || waitingForReceipt,
    txHash,
    txConfirmed,
  };
}
