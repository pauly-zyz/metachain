"""Assemble brand/out/banner-frames/*.png into an optimized looping GIF (≤ 4.5 MB for DEX Screener).

Usage: python3 brand/make_gif.py [colors] [frame_ms]
"""
import glob
import os
import sys

from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
colors = int(sys.argv[1]) if len(sys.argv) > 1 else 128
frame_ms = int(sys.argv[2]) if len(sys.argv) > 2 else 70
files = sorted(glob.glob(os.path.join(here, "out", "banner-frames", "f*.png")))
frames = [Image.open(f).convert("RGB") for f in files]

# one shared palette built from a sample of frames → stable colors, smaller file
sample = Image.new("RGB", (frames[0].width, frames[0].height * 3))
for k, idx in enumerate([0, len(frames) // 3, 2 * len(frames) // 3]):
    sample.paste(frames[idx], (0, frames[0].height * k))
palette = sample.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q = [f.quantize(palette=palette, dither=Image.Dither.FLOYDSTEINBERG) for f in frames]

out = os.path.join(here, "out", "banner-1500x500.gif")
q[0].save(out, save_all=True, append_images=q[1:], duration=frame_ms, loop=0, optimize=True, disposal=1)
print(out, f"{os.path.getsize(out) / 1e6:.2f} MB", f"{len(q)} frames", f"{colors} colors")
