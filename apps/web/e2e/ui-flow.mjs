// Browser end-to-end test of the META Chain web app against the local stack (scripts/e2e-local.sh up).
// A minimal EIP-1193 provider is injected that forwards to anvil, whose dev account #1 is unlocked
// (anvil signs personal_sign / eth_sendTransaction for it). Usage:
//   node apps/web/e2e/ui-flow.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // pre-installed globally in CI images
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const SHOTS = process.argv[3] ?? "screenshots";
const RPC = "http://127.0.0.1:8545";
const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil dev account #1 (public test key)
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
await context.addInitScript(
  ({ rpc, account }) => {
    let id = 0;
    const listeners = {};
    const request = async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
      if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      });
      const j = await res.json();
      if (j.error) {
        const e = new Error(j.error.message);
        e.code = j.error.code;
        e.data = j.error.data;
        throw e;
      }
      return j.result;
    };
    window.ethereum = {
      isMetaMask: true,
      request,
      on: (ev, fn) => ((listeners[ev] ??= []).push(fn)),
      removeListener: (ev, fn) => (listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn)),
    };
  },
  { rpc: RPC, account: ACCOUNT },
);

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function waitStatus(text, timeout = 90_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}
async function clickAndWait(button, okText) {
  await page.getByRole("button", { name: button }).click();
  await page.waitForFunction(
    (t) => [...document.querySelectorAll("div")].some((d) => d.textContent?.includes(t) || d.textContent?.includes("failed")),
    okText,
    { timeout: 120_000 },
  );
  const failed = await page.getByText(/failed:/).count();
  if (failed) throw new Error(`${button}: ${await page.getByText(/failed:/).first().textContent()}`);
}

// ---------------------------------------------------------------- Account page
await page.goto(`${BASE}/app`);
await page.getByRole("button", { name: "Connect wallet" }).first().click();
await waitStatus("Smart account");
await page.waitForFunction(() => !document.body.textContent?.includes("computing…"), null, { timeout: 60_000 });
await page.screenshot({ path: `${SHOTS}/1-account-connected.png`, fullPage: true });

try {
  await clickAndWait("Faucet MockMETA (testnet)", "Testnet META faucet succeeded");
} catch (e) {
  // MockMETA faucet has a 1-day cooldown per address; fine if the wallet already holds META from a previous run
  console.log("faucet skipped:", e.message.split("\n")[0].slice(0, 160));
}
await clickAndWait("Deposit", "Deposit META succeeded");
await page.waitForTimeout(1500);
if (await page.getByText("Account active").count()) {
  console.log("account already active (previous run) — skipping activation");
} else {
  await clickAndWait("Send 0.003 ETH", "Send 0.003 ETH for activation succeeded");
  await clickAndWait("Activate", "Activation (deploy + approve) succeeded");
}
await waitStatus("Account active");

await page.getByLabel("Send META to").fill("0x000000000000000000000000000000000000dEaD");
await page.getByLabel("META amount").fill("0.01");
await clickAndWait("Estimate fee", "Fee estimate succeeded");
await waitStatus("Estimate before sending");
await clickAndWait("Send", "Send transaction succeeded");
await waitStatus("Actual cost");
await page.screenshot({ path: `${SHOTS}/2-account-paid-in-meta.png`, fullPage: true });
const charged = await page.getByText("META charged").locator("..").textContent();
console.log("account page:", charged);

// ---------------------------------------------------------------- Agents page
await page.getByRole("link", { name: "AI agents" }).click();
await waitStatus("Create session key");
const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
await page.getByRole("button", { name: "Create & download agent credentials" }).click();
const download = await downloadPromise;
console.log("agent credentials downloaded:", download.suggestedFilename());
await waitStatus("Session key created");
await page.getByText("Active", { exact: true }).first().waitFor({ timeout: 60_000 });
await page.screenshot({ path: `${SHOTS}/3-agents-session.png`, fullPage: true });
await page.getByRole("button", { name: "Revoke" }).click();
await waitStatus("Session revoked.", 120_000);
await page.getByText("Revoked", { exact: true }).first().waitFor({ timeout: 60_000 });

// ---------------------------------------------------------------- Dashboard
await page.getByRole("link", { name: "Dashboard" }).click();
await waitStatus("Total transactions");
await page.waitForFunction(() => document.body.textContent?.includes("Latest transactions"), null, { timeout: 60_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/4-dashboard.png`, fullPage: true });
const totalOps = await page.getByText("Total transactions").locator("..").textContent();
console.log("dashboard:", totalOps);

if (errors.length) console.log("page errors:", errors);
await browser.close();
console.log("UI FLOW OK");
