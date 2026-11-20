#!/usr/bin/env bash
# Local end-to-end stack: anvil fork of Robinhood Chain TESTNET + META Chain contracts + Alto bundler.
# Usage: scripts/e2e-local.sh [test|example|up]
#   test    (default) run the SDK e2e suite, then stop everything
#   example run the autonomous agent example, then stop everything
#   up      start the stack and keep it running (Ctrl-C to stop) — used by the frontend demo
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-test}"
FORK_URL="${FORK_URL:-https://rpc.testnet.chain.robinhood.com}"
# Public anvil test keys (never use on a real network)
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # deployer / mock owner
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # demo account owner
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   # bundler executor
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6   # bundler utility
LOGDIR="${LOGDIR:-$(mktemp -d)}"; mkdir -p "$LOGDIR"
# NB: the npm `cast` wrapper always exits 0, so readiness is probed with curl.
rpc_up() { curl -sf -m 3 -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$1" >/dev/null 2>&1; }

stop_stack() {
  # the npm wrappers spawn native children: match both via their arguments
  pkill -f -- "--fork-url $FORK_URL" 2>/dev/null || true
  pkill -f -- "alto --entrypoints" 2>/dev/null || true
}
stop_stack
for i in $(seq 1 60); do
  if ! rpc_up http://127.0.0.1:8545; then break; fi
  [ "$i" = 10 ] && pkill -9 -f -- "--fork-url" 2>/dev/null || true
  [ "$i" = 60 ] && { echo "port 8545 still busy — stop the process using it"; exit 1; }
  sleep 1
done
cleanup() { [ "$MODE" = up ] || stop_stack; }
trap cleanup EXIT

echo "→ anvil fork of $FORK_URL (logs: $LOGDIR)"
anvil --fork-url "$FORK_URL" --port 8545 >"$LOGDIR/anvil.log" 2>&1 &
ready=0; for _ in $(seq 1 180); do rpc_up http://127.0.0.1:8545 && { ready=1; break; }; sleep 1; done
[ "$ready" = 1 ] || { echo "anvil did not start"; cat "$LOGDIR/anvil.log"; exit 1; }

echo "→ deploying META Chain (mocks + oracle + paymaster + AgentPayments)"
(cd contracts && DEPLOYMENT_NAME=anvil-testnet-fork PRIVATE_KEY=$K0 \
  forge script script/Deploy.s.sol:DeployTestnet --rpc-url http://127.0.0.1:8545 --broadcast >"$LOGDIR/deploy.log" 2>&1)

echo "→ Alto bundler on :4337"
npx alto --entrypoints 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  --executor-private-keys $K2 --utility-private-key $K3 --rpc-url http://127.0.0.1:8545 --port 4337 \
  --safe-mode false --min-entity-stake 0 --min-entity-unstake-delay 1 >"$LOGDIR/alto.log" 2>&1 &
for _ in $(seq 1 60); do curl -sf -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_supportedEntryPoints","params":[]}' http://127.0.0.1:4337 >/dev/null && break; sleep 1; done

case "$MODE" in
  test) E2E=1 npm run test:e2e -w @metachain/sdk ;;
  example) OWNER_PRIVATE_KEY=$K1 LOCAL_BOOTSTRAP=1 npm run example:agent -w @metachain/sdk ;;
  up) echo "stack up: RPC http://127.0.0.1:8545  bundler http://127.0.0.1:4337  deployment contracts/deployments/anvil-testnet-fork.json"; wait ;;
esac
