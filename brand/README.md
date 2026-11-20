# META Chain brand assets (DEX Screener)

| File | Spec |
|---|---|
| `out/logo-512.png` | 1:1, 512×512 PNG (also `out/logo-1000.png`) |
| `out/banner-1500x500.gif` | 3:1, 1500×500 animated GIF, 40 frames, seamless loop, < 4.5 MB |

Original mark (diamond + gas flame), Meta-blue palette. Not affiliated with Meta Platforms, Inc. or Robinhood —
the assets intentionally do not use Meta's logo or trademarks.

Regenerate:

```bash
node brand/render.cjs && python3 brand/make_gif.py 128 65
```
