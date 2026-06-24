#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
API_KEY="${API_KEY:-}"
MODEL="${MODEL:-qwen3.6-27b}"
TARGET_TOKENS="${TARGET_TOKENS:-17000}"

if [ -z "$API_KEY" ]; then
  echo "Error: API_KEY is required. Example: API_KEY=sk-xxx bash test/run_large_context_demo.sh" >&2
  exit 1
fi

echo "Running large context demo..."
echo "  BASE_URL=$BASE_URL"
echo "  MODEL=$MODEL"
echo "  TARGET_TOKENS=$TARGET_TOKENS"
echo

python3 test/large_context_demo.py \
  --base-url "$BASE_URL" \
  --api-key "$API_KEY" \
  --model "$MODEL" \
  --target-tokens "$TARGET_TOKENS" \
  "$@"
