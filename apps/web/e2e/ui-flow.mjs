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
    (t) => [...document.querySelectorAll("div")].some((d) => d.textContent?.includes(t) || d.textContent?.includes("gagal")),
    okText,
    { timeout: 120_000 },
  );
  const failed = await page.getByText(/gagal:/).count();
  if (failed) throw new Error(`${button}: ${await page.getByText(/gagal:/).first().textContent()}`);
}

// ---------------------------------------------------------------- Account page
await page.goto(BASE);
await page.getByRole("button", { name: "Hubungkan wallet" }).click();
await waitStatus("Smart account");
await page.waitForFunction(() => !document.body.textContent?.includes("menghitung…"), null, { timeout: 60_000 });
await page.screenshot({ path: `${SHOTS}/1-account-connected.png`, fullPage: true });

try {
  await clickAndWait("Faucet MockMETA (testnet)", "Faucet META testnet berhasil");
} catch (e) {
  // MockMETA faucet has a 1-day cooldown per address; fine if the wallet already holds META from a previous run
  console.log("faucet skipped:", e.message.split("\n")[0].slice(0, 160));
}
await clickAndWait("Setor", "Setor META berhasil");
await page.waitForTimeout(1500);
if (await page.getByText("Akun aktif").count()) {
  console.log("account already active (previous run) — skipping activation");
} else {
  await clickAndWait("Kirim 0.003 ETH", "Kirim 0.003 ETH untuk aktivasi berhasil");
  await clickAndWait("Aktifkan", "Aktivasi (deploy + approve) berhasil");
}
await waitStatus("Akun aktif");

await page.getByLabel("Kirim META ke").fill("0x000000000000000000000000000000000000dEaD");
await page.getByLabel("Jumlah META").fill("0.01");
await clickAndWait("Estimasi biaya", "Estimasi biaya berhasil");
await waitStatus("Estimasi sebelum kirim");
await clickAndWait("Kirim", "Kirim transaksi berhasil");
await waitStatus("Biaya aktual");
await page.screenshot({ path: `${SHOTS}/2-account-paid-in-meta.png`, fullPage: true });
const charged = await page.getByText("META ditagih").locator("..").textContent();
console.log("account page:", charged);

// ---------------------------------------------------------------- Agents page
await page.getByRole("link", { name: "Agen AI" }).click();
await waitStatus("Buat session key");
const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
await page.getByRole("button", { name: "Buat & unduh kredensial agen" }).click();
const download = await downloadPromise;
console.log("agent credentials downloaded:", download.suggestedFilename());
await waitStatus("Session key dibuat");
await page.getByText("Aktif", { exact: true }).first().waitFor({ timeout: 60_000 });
await page.screenshot({ path: `${SHOTS}/3-agents-session.png`, fullPage: true });
await page.getByRole("button", { name: "Cabut" }).click();
await waitStatus("Session dicabut.", 120_000);
await page.getByText("Dicabut", { exact: true }).first().waitFor({ timeout: 60_000 });

// ---------------------------------------------------------------- Dashboard
await page.getByRole("link", { name: "Dashboard" }).click();
await waitStatus("Total transaksi");
await page.waitForFunction(() => document.body.textContent?.includes("Transaksi terbaru"), null, { timeout: 60_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/4-dashboard.png`, fullPage: true });
const totalOps = await page.getByText("Total transaksi").locator("..").textContent();
console.log("dashboard:", totalOps);

if (errors.length) console.log("page errors:", errors);
await browser.close();
console.log("UI FLOW OK");
