// Renders DEX Screener assets from brand/render.html:
//   brand/out/logo-512.png        (1:1)
//   brand/out/banner-frames/*.png (3:1 animation frames → GIF via brand/make_gif.py)
// Usage: node brand/render.cjs
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const out = path.join(__dirname, "out");
  const framesDir = path.join(out, "banner-frames");
  fs.mkdirSync(framesDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("file://" + path.join(__dirname, "render.html"));
  await page.evaluate(() => window.ready);

  const save = async (file) => {
    const data = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
    fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  };

  for (const size of [512, 1000]) {
    await page.evaluate((s) => window.drawLogo(s), size);
    await save(path.join(out, `logo-${size}.png`));
  }

  const FRAMES = Number(process.env.FRAMES ?? 36);
  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate(([t]) => window.drawBanner(1500, 500, t), [i / FRAMES]);
    await save(path.join(framesDir, `f${String(i).padStart(3, "0")}.png`));
  }
  await browser.close();
  console.log(`rendered logo + ${FRAMES} banner frames`);
})();
