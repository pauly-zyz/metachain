import {
  encodeFunctionData,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import {
  createBundlerClient,
  entryPoint07Abi,
  entryPoint07Address,
  formatUserOperationRequest,
  getUserOperationHash,
} from "viem/account-abstraction";
import { encodeSmartSessionSignature, SmartSessionMode } from "@rhinestone/module-sdk";
import { agentPaymentsAbi } from "./abis.js";
import { createMetaSmartAccount, defaultFeeEstimator, type Call, type FeeEstimator } from "./account.js";
import { createMetaPaymaster } from "./paymaster.js";
import { kernelValidatorNonceKey } from "./sessions.js";
import { parseMetaGasPaid, type MetaGasPaid } from "./fees.js";
import type { MetaChainAddresses } from "./addresses.js";

/** Well-formed dummy ECDSA signature for gas estimation (recovers to an unrelated address, never reverts). */
const DUMMY_ECDSA_SIGNATURE: Hex =
  "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";

/**
 * Rhinestone OwnableValidator (CheckNSignatures) recovers against the RAW hash when v ∈ {27,28} and against the
 * EIP-191 prefixed hash when v > 30 (Safe-style). Prefer a raw-hash signature; fall back to eth_sign with v + 4.
 */
export async function signForOwnableValidator(key: LocalAccount, hash: Hex): Promise<Hex> {
  if (key.sign) return key.sign({ hash });
  const sig = await key.signMessage({ message: { raw: hash } });
  const v = Number.parseInt(sig.slice(-2), 16) + 4;
  return `${sig.slice(0, -2)}${v.toString(16)}` as Hex;
}

export interface AgentPaymentResult {
  userOpHash: Hex;
  transactionHash: Hex;
  success: boolean;
  gas?: MetaGasPaid;
  paymentId?: bigint;
}

/**
 * Client used by an AI agent that only holds a SESSION KEY (never the account owner key).
 * Every UserOperation is validated by Rhinestone Smart Sessions against the session's policies and pays gas
 * in META through MetaTokenPaymaster.
 */
export async function createAgentClient(args: {
  client: PublicClient;
  chain: Chain;
  bundlerUrl: string;
  accountAddress: Address;
  sessionKey: LocalAccount;
  permissionId: Hex;
  addresses: Pick<MetaChainAddresses, "paymaster" | "agentPayments" | "smartSessions">;
  fees?: FeeEstimator;
  slippageBps?: bigint | null;
}) {
  // The owner field is irrelevant here (we never sign with it); the account object is used for call encoding.
  const account = await createMetaSmartAccount({
    client: args.client,
    owner: args.sessionKey,
    address: args.accountAddress,
  });
  const bundler = createBundlerClient({
    client: args.client,
    chain: args.chain,
    transport: http(args.bundlerUrl),
    paymaster: createMetaPaymaster({
      client: args.client,
      paymaster: args.addresses.paymaster,
      slippageBps: args.slippageBps,
    }),
  });
  const fees = args.fees ?? defaultFeeEstimator(args.client);
  const nonceKey = kernelValidatorNonceKey(args.addresses.smartSessions);

  async function sendCalls(calls: Call[]) {
    const nonce = await args.client.readContract({
      address: entryPoint07Address,
      abi: entryPoint07Abi,
      functionName: "getNonce",
      args: [args.accountAddress, nonceKey],
    });
    const stub = encodeSmartSessionSignature({
      mode: SmartSessionMode.USE,
      permissionId: args.permissionId,
      signature: DUMMY_ECDSA_SIGNATURE,
    });
    const userOp = await bundler.prepareUserOperation({
      account,
      calls: calls.map((c) => ({ to: c.to, data: c.data ?? "0x", value: c.value ?? 0n })),
      nonce,
      signature: stub,
      ...(await fees()),
    });
    const hash = getUserOperationHash({
      userOperation: { ...userOp, sender: args.accountAddress },
      entryPointAddress: entryPoint07Address,
      entryPointVersion: "0.7",
      chainId: args.chain.id,
    });
    const sessionSig = await signForOwnableValidator(args.sessionKey, hash);
    const signed = {
      ...userOp,
      sender: args.accountAddress,
      signature: encodeSmartSessionSignature({
        mode: SmartSessionMode.USE,
        permissionId: args.permissionId,
        signature: sessionSig,
      }),
    };
    const userOpHash = (await bundler.request({
      method: "eth_sendUserOperation",
      params: [formatUserOperationRequest(signed), entryPoint07Address],
    })) as Hex;
    const receipt = await bundler.waitForUserOperationReceipt({ hash: userOpHash, timeout: 120_000 });
    return { userOpHash, receipt };
  }

  return {
    address: args.accountAddress,
    sessionKey: args.sessionKey.address,
    sendCalls,
    /** Pay `amount` of `token` to `payee` through AgentPayments, with an on-chain receipt. */
    async pay(p: {
      token: Address;
      payee: Address;
      amount: bigint;
      memo?: string;
      /** e.g. keccak256 of the inference request/response; defaults to keccak256(memo). */
      memoHash?: Hex;
    }): Promise<AgentPaymentResult> {
      const memo = p.memo ?? "";
      const memoHash = p.memoHash ?? keccak256(stringToHex(memo));
      const data = encodeFunctionData({
        abi: agentPaymentsAbi,
        functionName: "pay",
        args: [p.token, p.payee, p.amount, memoHash, memo],
      });
      const { userOpHash, receipt } = await sendCalls([{ to: args.addresses.agentPayments, data }]);
      const gas = parseMetaGasPaid(receipt.logs, args.addresses.paymaster);
      let paymentId: bigint | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === args.addresses.agentPayments.toLowerCase() && log.topics[1]) {
          paymentId = BigInt(log.topics[1]);
        }
      }
      return { userOpHash, transactionHash: receipt.receipt.transactionHash, success: receipt.success, gas, paymentId };
    },
  };
}
