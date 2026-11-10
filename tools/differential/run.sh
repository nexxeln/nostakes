#!/bin/sh
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
seed=20261110
hands=100000

while [ $# -gt 0 ]; do
  case "$1" in
    --seed) seed=$2; shift 2 ;;
    --hands) hands=$2; shift 2 ;;
    *) echo "usage: run.sh [--seed N] [--hands N]" >&2; exit 2 ;;
  esac
done

work=${DIFFERENTIAL_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/nostakes-differential.XXXXXX")}
mkdir -p "$work"

pnpm --dir "$root" --filter @nostakes/engine --silent run build
node "$root/packages/engine/scripts/export-hands.ts" --seed "$seed" --hands "$hands" > "$work/hands.jsonl"
echo "exported to $work/hands.jsonl, report in $work/report.json" >&2
exec uv run --quiet --locked --script "$root/tools/differential/replay.py" "$work/hands.jsonl" --report "$work/report.json"
