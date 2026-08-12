"use client";

import { useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
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

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

/** Shape matches what the History/Achievements UI expects from Circle's getTransactions API. */
export type EvmTx = {
  transactionType: "INBOUND" | "OUTBOUND";
  amounts: [string];
  sourceAddress: string;
  destinationAddress: string;
  createDate: string;
};

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
      refetchInterval: 45000,
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

  const publicClient = usePublicClient({ chainId: arcTestnet.id });

  /**
   * Reads USDC transfer history for `userAddress` directly from Arc Testnet logs
   * (Transfer events on the USDC ERC-20 contract) — no Circle API involved.
   *
   * Arc's public RPC caps how wide a block range eth_getLogs can cover per call,
   * AND rate-limits how many calls can land in quick succession. So instead of
   * firing off several wide, parallel queries (which trips the rate limit almost
   * immediately), we walk backwards from the latest block in small sequential
   * chunks with a short delay between each request, stopping early once we have
   * enough transactions or run out of chunks to check.
   */
  const loadEvmHistory = async (userAddress: `0x${string}`): Promise<EvmTx[]> => {
    if (!publicClient) return [];

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const CHUNK_SIZE = 2000n;
    const MAX_CHUNKS = 40; // up to ~80,000 blocks of lookback
    const DELAY_MS = 350;
    const TARGET_COUNT = 25;
    const RETRY_DELAYS_MS = [800, 1800]; // retries per chunk before giving up on it

    const getLogsWithRetry = async (args: { from?: `0x${string}`; to?: `0x${string}` }, fromBlock: bigint, toBlock: bigint) => {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await publicClient.getLogs({ address: ARC_USDC_ADDRESS, event: transferEvent, args, fromBlock, toBlock });
        } catch (e) {
          if (attempt === RETRY_DELAYS_MS.length) throw e;
          console.warn(`[HashCrew] getLogs retry ${attempt + 1} for ${fromBlock.toString()}-${toBlock.toString()}:`, e);
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
      return [];
    };

    let latest: bigint;
    try {
      latest = await publicClient.getBlockNumber();
    } catch (e) {
      console.error("[HashCrew] failed to fetch latest block number:", e);
      return [];
    }

    const collected: any[] = [];
    let cursor = latest;
    let chunksChecked = 0;

    while (chunksChecked < MAX_CHUNKS && cursor >= 0n && collected.length < TARGET_COUNT) {
      const fromBlock = cursor > CHUNK_SIZE ? cursor - CHUNK_SIZE : 0n;
      try {
        const outgoing = await getLogsWithRetry({ from: userAddress }, fromBlock, cursor);
        collected.push(...outgoing);
        await sleep(DELAY_MS);
        const incoming = await getLogsWithRetry({ to: userAddress }, fromBlock, cursor);
        collected.push(...incoming);
      } catch (e) {
        console.warn(`[HashCrew] chunk ${fromBlock.toString()}-${cursor.toString()} failed after retries:`, e);
      }

      if (fromBlock === 0n) break;
      cursor = fromBlock - 1n;
      chunksChecked++;
      await sleep(DELAY_MS);
    }

    console.log(`[HashCrew] history scan finished: ${chunksChecked + 1} chunk(s) checked, ${collected.length} raw log(s) found`);

    const seen = new Set<string>();
    const unique = collected.filter((log) => {
      const key = `${log.transactionHash}-${log.logIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)));
    const top = unique.slice(0, 25);

    const blockTimeCache = new Map<string, number>();
    const results = await Promise.all(
      top.map(async (log) => {
        const bn = log.blockNumber;
        const cacheKey = bn?.toString() ?? "0";
        let ts = blockTimeCache.get(cacheKey);
        if (ts === undefined) {
          try {
            const block = bn ? await publicClient.getBlock({ blockNumber: bn }) : null;
            ts = block ? Number(block.timestamp) * 1000 : Date.now();
          } catch {
            ts = Date.now();
          }
          blockTimeCache.set(cacheKey, ts);
        }
        const args = log.args as { from?: string; to?: string; value?: bigint };
        const from = args.from ?? "";
        const to = args.to ?? "";
        const value = args.value ?? 0n;
        const isOut = from.toLowerCase() === userAddress.toLowerCase();
        const tx: EvmTx = {
          transactionType: isOut ? "OUTBOUND" : "INBOUND",
          amounts: [formatUnits(value, ARC_USDC_DECIMALS)],
          sourceAddress: from,
          destinationAddress: to,
          createDate: new Date(ts).toISOString(),
        };
        return tx;
      })
    );

    return results;
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
    loadEvmHistory,
  };
}
