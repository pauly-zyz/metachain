import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "void" background, panels and hairlines
        ink: { DEFAULT: "#05070d", soft: "#0b1019", line: "#182133", deep: "#03050a" },
        // meta blue = primary, cyan ("amber" token kept for compatibility) = secondary
        accent: { DEFAULT: "#0866ff", soft: "#0a1a33", glow: "#3d8bff" },
        amber: { DEFAULT: "#5cc8ff" },
        bone: { DEFAULT: "#e7edf7", dim: "#9ba7bb", mute: "#64718a" },
        good: "#3ddc84",
        warn: "#ffb020",
        bad: "#ff4d4d",
      },
      fontFamily: {
        display: ['"Chakra Petch"', '"Arial Narrow"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: { hud: "0.28em", wide2: "0.14em" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(16px)" }, "100%": { opacity: "1", transform: "none" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.25" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100%)" } },
        flow: { "0%": { strokeDashoffset: "40" }, "100%": { strokeDashoffset: "0" } },
      },
      animation: {
        rise: "rise .8s cubic-bezier(.2,.7,.2,1) both",
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        scan: "scan 6s linear infinite",
        flow: "flow 1.2s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
