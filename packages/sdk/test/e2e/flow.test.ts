/**
 * End-to-end test against a local anvil fork of Robinhood Chain TESTNET + the Alto bundler.
 * Real on the fork: EntryPoint v0.7, Kernel v3.1, Rhinestone Smart Sessions & policies.
 * Deployed by script/Deploy.s.sol on the fork: MockMETA, mocks feeds/pool, oracle, paymaster, AgentPayments.
 *
 *   anvil --fork-url https://rpc.testnet.chain.robinhood.com
 *   (cd contracts && DEPLOYMENT_NAME=anvil-testnet-fork PRIVATE_KEY=<anvil key 0> forge script script/Deploy.s.sol:DeployTestnet --rpc-url http://127.0.0.1:8545 --broadcast)
 *   npx alto --entrypoints 0x0000000071727De22E5E9d8BAf0edAc6f37da032 --executor-private-keys <anvil key 2> \
 *            --utility-private-key <anvil key 3> --rpc-url http://127.0.0.1:8545 --port 4337 --safe-mode false --min-entity-stake 0
 *   E2E=1 npm run test:e2e -w @metachain/sdk
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseEther,
  parseUnits,
  toFunctionSelector,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  addressesFromDeployment,
  agentPaymentsAbi,
  approveMetaCall,
  buildAgentSession,
  createAgentClient,
  createBootstrapClient,
  createMetaAccountClient,
  createMetaSmartAccount,
  estimateMetaFee,
  getCreateAgentSessionCalls,
  getMetaReadiness,
  getRevokeAgentSessionCalls,
  isAgentSessionEnabled,
  localFork,
  metaTokenPaymasterAbi,
  mockAggregatorAbi,
  mockMetaAbi,
  parseMetaGasPaid,
  robinhoodTestnet,
  type MetaChainAddresses,
} from "../../src/index.js";

const RUN = process.env.E2E === "1";
const RPC = process.env.E2E_RPC ?? "http://127.0.0.1:8545";
const BUNDLER = process.env.E2E_BUNDLER ?? "http://127.0.0.1:4337";
const DEPLOYMENT =
  process.env.E2E_DEPLOYMENT ?? join(__dirname, "../../../../contracts/deployments/anvil-testnet-fork.json");
// anvil default key #0 (public test key) = deployer / mock owner / feed updater
const AMOUNT_LIMIT_SELECTOR = toFunctionSelector("AmountLimitExceeded(uint256,uint256)");
const DEPLOYER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.skipIf(!RUN)("META Chain end-to-end (anvil fork + Alto)", () => {
  const chain = localFork(robinhoodTestnet, RPC);
  let client: PublicClient;
  let addresses: MetaChainAddresses;
  const deployer = privateKeyToAccount(DEPLOYER_KEY);
  const owner = privateKeyToAccount(generatePrivateKey());
  const sessionKey = privateKeyToAccount(generatePrivateKey());
  const payee = privateKeyToAccount(generatePrivateKey()).address;
  let accountAddress: Address;
  let permissionId: Hex;

  const wallet = () => createWalletClient({ account: deployer, chain, transport: http(RPC) });
  const test = createTestClient({ mode: "anvil", chain, transport: http(RPC) });

  async function refreshPrices() {
    const d = JSON.parse(readFileSync(DEPLOYMENT, "utf8"));
    const w = wallet();
    for (const [feed, answer] of [
      [d.metaUsdFeed, 583_50000000n],
      [d.ethUsdFeed, 1748_27000000n],
      [d.quoteUsdFeed, 1_00000000n],
    ] as const) {
      const h = await w.writeContract({ address: feed, abi: mockAggregatorAbi, functionName: "setAnswer", args: [answer] });
      await client.waitForTransactionReceipt({ hash: h });
    }
    const h = await w.writeContract({ address: addresses.paymaster, abi: metaTokenPaymasterAbi, functionName: "updatePrice" });
    await client.waitForTransactionReceipt({ hash: h });
  }

  beforeAll(async () => {
    client = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
    addresses = addressesFromDeployment(JSON.parse(readFileSync(DEPLOYMENT, "utf8")));
    await refreshPrices();
  }, 120_000);

  it("derives a Kernel v3.1 account and bootstraps it (deploy + approve) with ETH", async () => {
    const account = await createMetaSmartAccount({ client, owner });
    accountAddress = account.address;
    await test.setBalance({ address: accountAddress, value: parseEther("0.01") });
    const mint = await wallet().writeContract({
      address: addresses.meta,
      abi: mockMetaAbi,
      functionName: "mint",
      args: [accountAddress, parseEther("5")],
    });
    await client.waitForTransactionReceipt({ hash: mint });

    const boot = createBootstrapClient({ account, chain, client, bundlerUrl: BUNDLER });
    const hash = await boot.sendUserOperation({ calls: [approveMetaCall(addresses)] });
    const r = await boot.waitForUserOperationReceipt({ hash });
    expect(r.success).toBe(true);

    const ready = await getMetaReadiness(client, addresses, accountAddress);
    expect(ready.deployed).toBe(true);
    expect(ready.ready).toBe(true);
  }, 180_000);

  it("estimates the fee in USD and META, then pays gas in META", async () => {
    const account = await createMetaSmartAccount({ client, owner, address: accountAddress });
    const metaClient = createMetaAccountClient({ account, chain, client, bundlerUrl: BUNDLER, addresses });

    const calls = [{ to: payee, value: 0n, data: "0x" as Hex }];
    const prepared = await metaClient.prepareUserOperation({ calls });
    const est = await estimateMetaFee({
      client,
      paymaster: addresses.paymaster,
      gas: {
        callGasLimit: prepared.callGasLimit,
        verificationGasLimit: prepared.verificationGasLimit,
        preVerificationGas: prepared.preVerificationGas,
        paymasterVerificationGasLimit: prepared.paymasterVerificationGasLimit ?? 0n,
        paymasterPostOpGasLimit: prepared.paymasterPostOpGasLimit ?? 0n,
        maxFeePerGas: prepared.maxFeePerGas,
      },
    });
    expect(est.maxMeta).toBeGreaterThan(0n);
    expect(est.maxUsd).toBeLessThan(parseEther("1")); // < $1 worst case

    const metaBefore = await client.readContract({ address: addresses.meta, abi: erc20Abi, functionName: "balanceOf", args: [accountAddress] });
    const ethBefore = await client.getBalance({ address: accountAddress });
    const hash = await metaClient.sendUserOperation({ calls });
    const r = await metaClient.waitForUserOperationReceipt({ hash });
    expect(r.success).toBe(true);
    expect(r.paymaster?.toLowerCase()).toBe(addresses.paymaster.toLowerCase());

    const paid = parseMetaGasPaid(r.logs, addresses.paymaster);
    expect(paid).toBeDefined();
    const metaAfter = await client.readContract({ address: addresses.meta, abi: erc20Abi, functionName: "balanceOf", args: [accountAddress] });
    expect(metaBefore - metaAfter).toBe(paid!.metaCharged);
    expect(paid!.metaCharged).toBeLessThanOrEqual(est.maxMeta);
    expect(await client.getBalance({ address: accountAddress })).toBe(ethBefore); // no ETH spent
  }, 180_000);

  it("owner creates a bounded session key for an AI agent (paid in META)", async () => {
    const account = await createMetaSmartAccount({ client, owner, address: accountAddress });
    const metaClient = createMetaAccountClient({ account, chain, client, bundlerUrl: BUNDLER, addresses });
    const now = Number((await client.getBlock()).timestamp);
    const session = buildAgentSession({
      chainId: chain.id,
      sessionKey: sessionKey.address,
      agentPayments: addresses.agentPayments,
      validUntil: now + 3600,
      maxUses: 10n,
    });
    const created = await getCreateAgentSessionCalls({
      client,
      account: accountAddress,
      addresses,
      session,
      token: addresses.meta,
      limits: { maxAmountPerPeriod: parseUnits("0.05", 18), maxUsdPerPeriod: 0n, period: 3600, maxTxPerPeriod: 3 },
      allowance: parseUnits("1", 18),
    });
    expect(created.installsModule).toBe(true);
    permissionId = created.permissionId;
    const hash = await metaClient.sendUserOperation({ calls: created.calls });
    const r = await metaClient.waitForUserOperationReceipt({ hash });
    expect(r.success).toBe(true);
    expect(await isAgentSessionEnabled(client, accountAddress, permissionId, addresses.smartSessions)).toBe(true);
  }, 180_000);

  it("agent pays autonomously with the session key; receipt recorded; gas paid in META", async () => {
    const agent = await createAgentClient({
      client,
      chain,
      bundlerUrl: BUNDLER,
      accountAddress,
      sessionKey,
      permissionId,
      addresses,
    });
    const res = await agent.pay({ token: addresses.meta, payee, amount: parseUnits("0.01", 18), memo: "inference #1" });
    expect(res.success).toBe(true);
    expect(res.gas?.metaCharged).toBeGreaterThan(0n);
    expect(res.paymentId).toBeDefined();
    const receipt = await client.readContract({
      address: addresses.agentPayments,
      abi: agentPaymentsAbi,
      functionName: "getReceipt",
      args: [res.paymentId!],
    });
    expect(receipt.payer.toLowerCase()).toBe(accountAddress.toLowerCase());
    expect(receipt.payee.toLowerCase()).toBe(payee.toLowerCase());
    expect(receipt.amount).toBe(parseUnits("0.01", 18));
    expect(
      await client.readContract({ address: addresses.meta, abi: erc20Abi, functionName: "balanceOf", args: [payee] }),
    ).toBe(parseUnits("0.01", 18));
  }, 180_000);

  it("per-period spend limit is enforced on-chain", async () => {
    const agent = await createAgentClient({ client, chain, bundlerUrl: BUNDLER, accountAddress, sessionKey, permissionId, addresses });
    // 0.01 already spent, limit 0.05 per hour → 0.05 more must fail
    // AmountLimitExceeded(uint256,uint256) (0x97121c21) is surfaced by the bundler gas estimation
    await expect(
      agent.pay({ token: addresses.meta, payee, amount: parseUnits("0.05", 18), memo: "too much" }),
    ).rejects.toThrow(new RegExp(AMOUNT_LIMIT_SELECTOR.slice(2), "i"));
  }, 180_000);

  it("session key cannot call anything other than AgentPayments.pay", async () => {
    const agent = await createAgentClient({ client, chain, bundlerUrl: BUNDLER, accountAddress, sessionKey, permissionId, addresses });
    const steal = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [sessionKey.address, parseUnits("1", 18)] });
    // rejected during validation (AA23) by Smart Sessions — not an execution revert
    await expect(agent.sendCalls([{ to: addresses.meta, data: steal }])).rejects.toThrow(/AA23|AA24/);
  }, 180_000);

  it("owner revokes the session; the agent can no longer pay", async () => {
    const account = await createMetaSmartAccount({ client, owner, address: accountAddress });
    const metaClient = createMetaAccountClient({ account, chain, client, bundlerUrl: BUNDLER, addresses });
    const hash = await metaClient.sendUserOperation({
      calls: getRevokeAgentSessionCalls({ permissionId, token: addresses.meta, agentPayments: addresses.agentPayments }),
    });
    expect((await metaClient.waitForUserOperationReceipt({ hash })).success).toBe(true);
    expect(await isAgentSessionEnabled(client, accountAddress, permissionId, addresses.smartSessions)).toBe(false);

    const agent = await createAgentClient({ client, chain, bundlerUrl: BUNDLER, accountAddress, sessionKey, permissionId, addresses });
    await expect(agent.pay({ token: addresses.meta, payee, amount: 1n, memo: "after revoke" })).rejects.toThrow(
      /AA23|AA24/,
    );
  }, 180_000);
});
