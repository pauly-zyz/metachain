import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sdkSrc = path.resolve(here, "../../packages/sdk/src/index.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume the workspace SDK from source (no separate SDK build needed, e.g. on Vercel).
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@metachain/sdk$": sdkSrc };
    // SDK sources use ESM-style ".js" import specifiers for ".ts" files
    config.resolve.extensionAlias = { ...config.resolve.extensionAlias, ".js": [".ts", ".tsx", ".js"] };
    // optional deps pulled by wallet libraries that are not needed in the browser
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
