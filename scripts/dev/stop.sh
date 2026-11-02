#!/bin/sh
# Stops a local dev server: whatever is listening on the app's dev port (and on its workerd inspector port) from
# packages/config/apps.ts, the single source for ports. Only used by `make stop-<app>` / `make restart-<app>`,
# which the owner runs on purpose; agents never run it (AGENTS.md: dev servers belong to the owner).
# Usage: scripts/dev/stop.sh <web|worship|academy|live|production|admin> [--dry-run]
set -eu

app="${1:-}"
dry="${2:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
ports_of() {
  sed -n "/$1 = {/,/}/p" "$root/packages/config/apps.ts" | sed -n "s/^[[:space:]]*$app:[[:space:]]*\([0-9][0-9]*\).*/\1/p"
}
dev_port="$(ports_of LOCAL_PORTS)"
inspector_port="$(ports_of LOCAL_INSPECTOR_PORTS)"
if [ -z "$app" ] || [ -z "$dev_port" ]; then
  echo "usage: stop.sh <app> [--dry-run] (no port found in packages/config/apps.ts for '$app')" >&2
  exit 1
fi

pids=""
for port in $dev_port $inspector_port; do
  found="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  pids="$pids $found"
done
pids="$(echo $pids | tr ' ' '\n' | sort -u | tr '\n' ' ')"

if [ -z "$(echo $pids)" ]; then
  echo "  $app: nothing is listening on :$dev_port"
  exit 0
fi
if [ "$dry" = "--dry-run" ]; then
  echo "  $app: would stop process(es) $pids (ports $dev_port $inspector_port)"
  exit 0
fi
# shellcheck disable=SC2086
kill $pids 2>/dev/null || true
# Give them a moment to release the port, then make sure.
i=0
while [ $i -lt 20 ]; do
  still=""
  for port in $dev_port $inspector_port; do
    still="$still $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  done
  [ -z "$(echo $still)" ] && break
  i=$((i + 1))
  sleep 0.25
done
left="$(echo $still)"
if [ -n "$left" ]; then
  # shellcheck disable=SC2086
  kill -9 $left 2>/dev/null || true
fi
echo "  $app: stopped (:$dev_port)"
