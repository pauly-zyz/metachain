import type { DeploymentJson } from "@metachain/sdk";

/**
 * Official META Chain deployments baked into the site, so production works without NEXT_PUBLIC_DEPLOYMENT_JSON.
 * NEXT_PUBLIC_DEPLOYMENT_JSON (if set) still takes precedence. Filled from contracts/deployments/<network>.json.
 */
export const BUILTIN_DEPLOYMENTS: Partial<Record<number, DeploymentJson & { deployBlock?: number }>> = {};
