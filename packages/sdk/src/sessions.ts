import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  keccak256,
  pad,
  toFunctionSelector,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  encodeValidationData,
  getEnableSessionsAction,
  getPermissionId,
  getRemoveSessionAction,
  getSmartSessionsValidator,
  getSudoPolicy,
  getTimeFramePolicy,
  getUsageLimitPolicy,
  type Session,
} from "@rhinestone/module-sdk";
import { agentPaymentsAbi } from "./abis.js";
import { SHARED_ADDRESSES, type MetaChainAddresses } from "./addresses.js";
import type { Call } from "./account.js";

/** ERC-7579 `execute(bytes32,bytes)` — the selector Kernel must allow for a plugin validator. */
export const KERNEL_EXECUTE_SELECTOR: Hex = "0xe9ae5c53";
export const AGENT_PAY_SELECTOR: Hex = toFunctionSelector("pay(address,address,uint256,bytes32,string)");
const MODULE_TYPE_VALIDATOR = 1n;

const kernelModuleAbi = [
  {
    type: "function",
    name: "installModule",
    stateMutability: "payable",
    inputs: [
      { name: "moduleType", type: "uint256" },
      { name: "module", type: "address" },
      { name: "initData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isModuleInstalled",
    stateMutability: "view",
    inputs: [
      { name: "moduleType", type: "uint256" },
      { name: "module", type: "address" },
      { name: "additionalContext", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/**
 * Kernel v3.1 `installModule(1, validator, initData)` payload:
 * `hook (20 bytes) ‖ abi.encode(validatorData, hookData, selectorData)`; `selectorData` grants the validator
 * access to `execute`. (Kernel source: src/Kernel.sol#installModule, v3.1.)
 */
export function encodeKernelValidatorInstall(validatorData: Hex, selector: Hex = KERNEL_EXECUTE_SELECTOR, hook: Address = zeroAddress): Hex {
  return encodePacked(
    ["address", "bytes"],
    [hook, encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }], [validatorData, "0x", selector])],
  );
}

/**
 * Kernel v3 nonce key selecting a non-root validator:
 * `mode (0x00) ‖ type (0x01 = VALIDATOR) ‖ validator (20 bytes) ‖ nonceKey (2 bytes)` = uint192.
 */
export function kernelValidatorNonceKey(validator: Address, nonceKey = 0): bigint {
  return BigInt(concat(["0x00", "0x01", validator, pad(toHex(nonceKey), { size: 2 })]));
}

export interface AgentLimits {
  /** Max token units per period (0 = no amount cap). */
  maxAmountPerPeriod: bigint;
  /** Max USD (18 decimals) per period, valued by MetaPriceOracle (0 = no USD cap). */
  maxUsdPerPeriod: bigint;
  /** Period length in seconds. */
  period: number;
  /** Max payments per period (0 = unlimited) — rate limit. */
  maxTxPerPeriod: number;
}

export interface AgentSessionParams {
  chainId: number | bigint;
  /** Address of the agent's session key (an EOA key held by the agent). */
  sessionKey: Address;
  agentPayments: Address;
  /** Unix seconds after which the session key stops working. */
  validUntil: number;
  validAfter?: number;
  /** Lifetime cap on the number of `pay` calls this session may make. */
  maxUses: bigint;
  salt?: Hex;
}

/**
 * Smart Sessions permission for an AI agent: it may ONLY call `AgentPayments.pay(...)`, only within the time
 * window, at most `maxUses` times, and may use the META paymaster. Per-period spend & rate limits are enforced
 * by AgentPayments at execution time (session validation cannot read the clock under ERC-7562).
 */
export function buildAgentSession(p: AgentSessionParams): Session {
  return {
    sessionValidator: SHARED_ADDRESSES.ownableValidator,
    sessionValidatorInitData: encodeValidationData({ threshold: 1, owners: [p.sessionKey] }),
    salt: p.salt ?? keccak256(encodePacked(["address", "uint48"], [p.sessionKey, p.validUntil])),
    // Smart Sessions requires ≥1 userOp policy; the real restrictions are the action policies below + AgentPayments.
    userOpPolicies: [getSudoPolicy()],
    erc7739Policies: { allowedERC7739Content: [], erc1271Policies: [] },
    actions: [
      {
        actionTarget: p.agentPayments,
        actionTargetSelector: AGENT_PAY_SELECTOR,
        actionPolicies: [
          getTimeFramePolicy({ validUntil: p.validUntil, validAfter: p.validAfter ?? 0 }),
          getUsageLimitPolicy({ limit: p.maxUses }),
        ],
      },
    ],
    chainId: BigInt(p.chainId),
    permitERC4337Paymaster: true,
  };
}

export async function isSmartSessionsInstalled(client: PublicClient, account: Address, smartSessions: Address) {
  const code = await client.getCode({ address: account });
  if (!code || code === "0x") return false;
  try {
    return await client.readContract({
      address: account,
      abi: kernelModuleAbi,
      functionName: "isModuleInstalled",
      args: [MODULE_TYPE_VALIDATOR, smartSessions, "0x"],
    });
  } catch {
    return false;
  }
}

/**
 * Calls the account OWNER sends (one UserOperation) to give an agent a bounded session key:
 *  1. install Smart Sessions with the session (or enable it if Smart Sessions is already installed)
 *  2. AgentPayments.setLimit(token, limits)   — per-period amount / USD / rate limits
 *  3. token.approve(AgentPayments, allowance) — hard cap on what AgentPayments can ever pull
 */
export async function getCreateAgentSessionCalls(args: {
  client: PublicClient;
  account: Address;
  addresses: Pick<MetaChainAddresses, "agentPayments" | "smartSessions">;
  session: Session;
  token: Address;
  limits: AgentLimits;
  allowance: bigint;
}): Promise<{ calls: Call[]; permissionId: Hex; installsModule: boolean }> {
  const permissionId = getPermissionId({ session: args.session }) as Hex;
  const installed = await isSmartSessionsInstalled(args.client, args.account, args.addresses.smartSessions);
  const calls: Call[] = [];
  if (!installed) {
    const validator = getSmartSessionsValidator({ sessions: [args.session], useRegistry: false });
    calls.push({
      to: args.account,
      value: 0n,
      data: encodeFunctionData({
        abi: kernelModuleAbi,
        functionName: "installModule",
        args: [MODULE_TYPE_VALIDATOR, args.addresses.smartSessions, encodeKernelValidatorInstall(validator.initData)],
      }),
    });
  } else {
    const action = getEnableSessionsAction({ sessions: [args.session] });
    calls.push({ to: action.target, data: action.callData, value: 0n });
  }
  calls.push({
    to: args.addresses.agentPayments,
    value: 0n,
    data: encodeFunctionData({
      abi: agentPaymentsAbi,
      functionName: "setLimit",
      args: [
        args.token,
        {
          maxAmountPerPeriod: args.limits.maxAmountPerPeriod,
          maxUsdPerPeriod: args.limits.maxUsdPerPeriod,
          period: args.limits.period,
          maxTxPerPeriod: args.limits.maxTxPerPeriod,
        },
      ],
    }),
  });
  calls.push({
    to: args.token,
    value: 0n,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [args.addresses.agentPayments, args.allowance] }),
  });
  return { calls, permissionId, installsModule: !installed };
}

/** Calls the OWNER sends to revoke a session key immediately (and optionally zero the AgentPayments allowance). */
export function getRevokeAgentSessionCalls(args: {
  permissionId: Hex;
  token?: Address;
  agentPayments?: Address;
}): Call[] {
  const action = getRemoveSessionAction({ permissionId: args.permissionId });
  const calls: Call[] = [{ to: action.target, data: action.callData, value: 0n }];
  if (args.token && args.agentPayments) {
    calls.push({
      to: args.token,
      value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [args.agentPayments, 0n] }),
    });
  }
  return calls;
}

/** Whether a session permission is currently enabled on the account (reads Smart Sessions). */
export async function isAgentSessionEnabled(client: PublicClient, account: Address, permissionId: Hex, smartSessions: Address = SHARED_ADDRESSES.smartSessions) {
  return client.readContract({
    address: smartSessions,
    abi: [
      {
        type: "function",
        name: "isPermissionEnabled",
        stateMutability: "view",
        inputs: [
          { name: "permissionId", type: "bytes32" },
          { name: "account", type: "address" },
        ],
        outputs: [{ type: "bool" }],
      },
    ] as const,
    functionName: "isPermissionEnabled",
    args: [permissionId, account],
  });
}
