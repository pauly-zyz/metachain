import { describe, expect, it } from "vitest";
import { decodeAbiParameters, getAddress, hexToBigInt, size, slice, toFunctionSelector, type Hex } from "viem";
import { encodePaymasterData } from "../../src/paymaster.js";
import {
  AGENT_PAY_SELECTOR,
  buildAgentSession,
  encodeKernelValidatorInstall,
  getRevokeAgentSessionCalls,
  KERNEL_EXECUTE_SELECTOR,
  kernelValidatorNonceKey,
} from "../../src/sessions.js";
import { SHARED_ADDRESSES } from "../../src/addresses.js";
import { getPermissionId } from "@rhinestone/module-sdk";

const SMART_SESSIONS = SHARED_ADDRESSES.smartSessions;

describe("paymasterData", () => {
  it("is always 32 bytes (uint256 maxMetaCost)", () => {
    expect(size(encodePaymasterData())).toBe(32);
    expect(size(encodePaymasterData(123n))).toBe(32);
    expect(hexToBigInt(encodePaymasterData(123n))).toBe(123n);
  });
});

describe("Kernel v3.1 encodings", () => {
  it("validator nonce key = 0x00 | 0x01 | validator | 0x0000 (uint192)", () => {
    const key = kernelValidatorNonceKey(SMART_SESSIONS);
    const hex = key.toString(16).padStart(48, "0");
    expect(hex.slice(0, 2)).toBe("00"); // mode default
    expect(hex.slice(2, 4)).toBe("01"); // VALIDATION_TYPE_VALIDATOR
    expect(getAddress(`0x${hex.slice(4, 44)}`)).toBe(getAddress(SMART_SESSIONS));
    expect(hex.slice(44)).toBe("0000");
    expect(key < 2n ** 192n).toBe(true);
  });

  it("installModule initData decodes the way Kernel's assembly reads it", () => {
    const validatorData: Hex = "0xdeadbeefcafe";
    const initData = encodeKernelValidatorInstall(validatorData);
    // hook = first 20 bytes
    expect(slice(initData, 0, 20)).toBe("0x0000000000000000000000000000000000000000");
    // Kernel: validatorData.offset = initData+52+calldataload(initData+20), etc. == abi.decode of initData[20:]
    const [v, hook, selector] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }, { type: "bytes" }],
      slice(initData, 20),
    );
    expect(v).toBe(validatorData);
    expect(hook).toBe("0x");
    expect(selector).toBe(KERNEL_EXECUTE_SELECTOR);
    expect(KERNEL_EXECUTE_SELECTOR).toBe(toFunctionSelector("execute(bytes32,bytes)"));
  });
});

describe("agent session", () => {
  const params = {
    chainId: 46630,
    sessionKey: "0x1111111111111111111111111111111111111111" as const,
    agentPayments: "0x2222222222222222222222222222222222222222" as const,
    validUntil: 1_900_000_000,
    maxUses: 100n,
  };

  it("only permits AgentPayments.pay with time-frame + usage-limit policies and the paymaster", () => {
    const s = buildAgentSession(params);
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]!.actionTarget).toBe(params.agentPayments);
    expect(s.actions[0]!.actionTargetSelector).toBe(AGENT_PAY_SELECTOR);
    expect(s.actions[0]!.actionPolicies.map((p) => getAddress(p.policy))).toEqual([
      getAddress(SHARED_ADDRESSES.timeFramePolicy),
      getAddress(SHARED_ADDRESSES.usageLimitPolicy),
    ]);
    expect(s.userOpPolicies.map((p) => getAddress(p.policy))).toEqual([getAddress(SHARED_ADDRESSES.sudoPolicy)]);
    expect(s.permitERC4337Paymaster).toBe(true);
    expect(s.chainId).toBe(46630n);
    expect(getAddress(s.sessionValidator)).toBe(getAddress(SHARED_ADDRESSES.ownableValidator));
  });

  it("permissionId is deterministic per (key, expiry) and differs across keys", () => {
    const a = getPermissionId({ session: buildAgentSession(params) });
    const b = getPermissionId({ session: buildAgentSession(params) });
    const c = getPermissionId({
      session: buildAgentSession({ ...params, sessionKey: "0x3333333333333333333333333333333333333333" }),
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("revoke calls target Smart Sessions and optionally zero the allowance", () => {
    const pid = getPermissionId({ session: buildAgentSession(params) }) as Hex;
    expect(getRevokeAgentSessionCalls({ permissionId: pid })).toHaveLength(1);
    const calls = getRevokeAgentSessionCalls({
      permissionId: pid,
      token: "0x4444444444444444444444444444444444444444",
      agentPayments: params.agentPayments,
    });
    expect(calls).toHaveLength(2);
    expect(getAddress(calls[0]!.to)).toBe(getAddress(SMART_SESSIONS));
  });
});
