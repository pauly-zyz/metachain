"use client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createPublicClient, http, type PublicClient } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { createMetaSmartAccount, getMetaReadiness } from "@metachain/sdk";
import { config } from "./config";

export function usePublicClient(): PublicClient {
  return useMemo(() => createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) }) as PublicClient, []);
}

/** Kernel v3.1 smart account owned by the connected wallet, plus its META readiness. */
export function useMetaAccount() {
  const client = usePublicClient();
  const { address: eoa } = useAccount();
  const { data: walletClient } = useWalletClient();

  const account = useQuery({
    queryKey: ["smart-account", eoa, !!walletClient],
    enabled: !!walletClient && !!eoa,
    queryFn: () => createMetaSmartAccount({ client, owner: walletClient! }),
    staleTime: Infinity,
  });

  const readiness = useQuery({
    queryKey: ["readiness", account.data?.address],
    enabled: !!account.data && !!config.addresses,
    queryFn: () => getMetaReadiness(client, config.addresses!, account.data!.address),
    refetchInterval: 5_000,
  });

  return { client, eoa, walletClient, account: account.data, accountError: account.error, readiness };
}
