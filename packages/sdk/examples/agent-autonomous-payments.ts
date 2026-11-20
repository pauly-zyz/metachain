/**
 * Example: an AI agent that pays other agents autonomously, using a bounded session key.
 *
 *   OWNER sets up (once):  smart account → bounded session key for the agent (AgentPayments only,
 *                          max N payments, expiry, per-hour spend limit, allowance cap).
 *   AGENT runs (forever):  for each inference job, pays the provider in META with a receipt whose memoHash
 *                          commits to the job; gas is paid in META via MetaTokenPaymaster.
 *
 * Run against the local e2e stack (anvil fork + Alto, see test/e2e/flow.test.ts) or the testnet:
 *   RPC_URL=... BUNDLER_URL=... DEPLOYMENT=../../contracts/deployments/robinhood-testnet.json \
 *   OWNER_PRIVATE_KEY=0x... npm run example:agent -w @metachain/sdk
 *
 * The account must already be bootstrapped (deployed, holding META, paymaster approved) — see README.
 * Not affiliated with Meta Platforms, Inc. or Robinhood.
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  parseUnits,
  stringToHex,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  addressesFromDeployment,
  approveMetaCall,
  buildAgentSession,
  createBootstrapClient,
  mockMetaAbi,
  createAgentClient,
  createMetaAccountClient,
  createMetaSmartAccount,
  formatMeta,
  getCreateAgentSessionCalls,
  getMetaReadiness,
  localFork,
  robinhood,
  robinhoodTestnet,
  DISCLAIMER,
} from "../src/index.js";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const BUNDLER_URL = process.env.BUNDLER_URL ?? "http://127.0.0.1:4337";
const DEPLOYMENT = process.env.DEPLOYMENT ?? "../../contracts/deployments/anvil-testnet-fork.json";
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY as Hex | undefined;

interface InferenceJob {
  id: number;
  provider: `0x${string}`;
  prompt: string;
  priceMeta: bigint;
}

async function main() {
  console.log(DISCLAIMER);
  if (!OWNER_PRIVATE_KEY) throw new Error("Set OWNER_PRIVATE_KEY (owner of a bootstrapped META Chain account)");

  const deployment = JSON.parse(readFileSync(DEPLOYMENT, "utf8"));
  const addresses = addressesFromDeployment(deployment);
  const base = deployment.chainId === robinhood.id ? robinhood : robinhoodTestnet;
  const chain = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost") ? localFork(base, RPC_URL) : base;
  const client = createPublicClient({ chain, transport: http(RPC_URL) }) as PublicClient;

  // ---------------------------------------------------------------- OWNER: grant a bounded session key
  const owner = privateKeyToAccount(OWNER_PRIVATE_KEY);
  const account = await createMetaSmartAccount({ client, owner });
  let readiness = await getMetaReadiness(client, addresses, account.address);
  if (!readiness.ready && process.env.LOCAL_BOOTSTRAP === "1") {
    // Local anvil demo only: give the account ETH for its first op, mint mock META, deploy + approve.
    const deployerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // public anvil key
    await createTestClient({ mode: "anvil", chain, transport: http(RPC_URL) }).setBalance({
      address: account.address,
      value: parseEther("0.01"),
    });
    const w = createWalletClient({ account: privateKeyToAccount(deployerKey), chain, transport: http(RPC_URL) });
    await client.waitForTransactionReceipt({
      hash: await w.writeContract({ address: addresses.meta, abi: mockMetaAbi, functionName: "mint", args: [account.address, parseEther("2")] }),
    });
    const boot = createBootstrapClient({ account, chain, client, bundlerUrl: BUNDLER_URL });
    await boot.waitForUserOperationReceipt({ hash: await boot.sendUserOperation({ calls: [approveMetaCall(addresses)] }) });
    readiness = await getMetaReadiness(client, addresses, account.address);
    console.log(`bootstrapped ${account.address} (deploy + approve, paid in ETH once)`);
  }
  if (!readiness.ready) throw new Error(`Account ${account.address} not ready: ${JSON.stringify(readiness)}`);
  const ownerClient = createMetaAccountClient({ account, chain, client, bundlerUrl: BUNDLER_URL, addresses });

  const agentKey = privateKeyToAccount(generatePrivateKey()); // in production: generated & stored by the agent
  const now = Number((await client.getBlock()).timestamp);
  const session = buildAgentSession({
    chainId: chain.id,
    sessionKey: agentKey.address,
    agentPayments: addresses.agentPayments,
    validUntil: now + 24 * 3600, // 1 day
    maxUses: 50n,
  });
  const { calls, permissionId } = await getCreateAgentSessionCalls({
    client,
    account: account.address,
    addresses,
    session,
    token: addresses.meta,
    limits: {
      maxAmountPerPeriod: parseUnits("0.02", 18), // ≤ 0.02 META per hour
      maxUsdPerPeriod: parseUnits("15", 18), // ≤ $15 per hour (oracle-valued)
      period: 3600,
      maxTxPerPeriod: 10, // ≤ 10 payments per hour
    },
    allowance: parseUnits("0.2", 18), // AgentPayments can never pull more than 0.2 META in total
  });
  const setupHash = await ownerClient.sendUserOperation({ calls });
  await ownerClient.waitForUserOperationReceipt({ hash: setupHash });
  console.log(`session key ${agentKey.address} granted (permissionId ${permissionId})`);

  // ---------------------------------------------------------------- AGENT: autonomous loop
  const agent = await createAgentClient({
    client,
    chain,
    bundlerUrl: BUNDLER_URL,
    accountAddress: account.address,
    sessionKey: agentKey,
    permissionId,
    addresses,
  });

  const providers = [privateKeyToAccount(generatePrivateKey()).address, privateKeyToAccount(generatePrivateKey()).address];
  const jobs: InferenceJob[] = [
    { id: 1, provider: providers[0]!, prompt: "summarize Q3 earnings call", priceMeta: parseUnits("0.004", 18) },
    { id: 2, provider: providers[1]!, prompt: "translate report to Bahasa Indonesia", priceMeta: parseUnits("0.006", 18) },
    { id: 3, provider: providers[0]!, prompt: "classify 1k support tickets", priceMeta: parseUnits("0.008", 18) },
    { id: 4, provider: providers[1]!, prompt: "very expensive job (exceeds hourly limit)", priceMeta: parseUnits("0.01", 18) },
  ];

  for (const job of jobs) {
    const memoHash = keccak256(stringToHex(JSON.stringify({ job: job.id, prompt: job.prompt })));
    try {
      const res = await agent.pay({
        token: addresses.meta,
        payee: job.provider,
        amount: job.priceMeta,
        memo: `job #${job.id}`,
        memoHash,
      });
      console.log(
        `✔ job #${job.id}: paid ${formatMeta(job.priceMeta)} → ${job.provider} | receipt #${res.paymentId} | gas ${formatMeta(res.gas?.metaCharged ?? 0n)} | tx ${res.transactionHash}`,
      );
    } catch (e) {
      console.log(`✘ job #${job.id}: refused by on-chain limits (${(e as Error).message.split("\n")[0]})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
