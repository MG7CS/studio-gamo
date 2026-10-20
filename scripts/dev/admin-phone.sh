#!/bin/sh
# Opens the LOCAL admin to one phone on the same Wi-Fi, behind a random secret in the link.
# Usage: scripts/dev/admin-phone.sh [--print-only]     (normally via: make admin-phone)
# - A new secret on every run; the link works only while this command runs (Ctrl-C ends it and the secret).
# - The admin on the network refuses every request that does not carry the secret (apps/admin/src/lib/gate.ts).
# - The port comes from LOCAL_PORTS in packages/config/apps.ts (the single source).
# --print-only prints the block with a made-up secret and starts nothing (nothing is copied either).
set -eu

root="$(cd "$(dirname "$0")/../.." && pwd)"
port="$(sed -n '/LOCAL_PORTS = {/,/}/p' "$root/packages/config/apps.ts" | sed -n "s/^[[:space:]]*admin:[[:space:]]*\([0-9][0-9]*\).*/\1/p")"
if [ -z "$port" ]; then
  echo "admin-phone.sh: no admin port found in packages/config/apps.ts" >&2
  exit 1
fi

print_only=0
[ "${1:-}" = "--print-only" ] && print_only=1

if [ "$print_only" = 1 ]; then
  secret="0123456789abcdef0123456789abcdef0123456789abcdef"
else
  secret="$(openssl rand -hex 24 2>/dev/null || node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  if [ "${#secret}" -lt 32 ]; then
    echo "admin-phone.sh: could not generate a random secret" >&2
    exit 1
  fi
fi

ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
link="http://${ip:-<your-computer-ip>}:$port/?phone=$secret"

copied="Copy it from here."
if [ "$print_only" = 0 ] && [ -n "$ip" ] && command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$link" | pbcopy
  copied="Copied to your clipboard."
fi

echo ""
echo "  Admin on your phone (same Wi-Fi):"
echo ""
echo "    $link"
echo ""
echo "  $copied Open it on your phone once; the phone then stays signed in for 8 hours."
echo ""
echo "  - The link works only while this command runs. Every run makes a new secret."
echo "  - Anyone who has the link can use the local admin (sample data only). Keep it private."
echo "  - Without the secret the admin refuses every request, on this computer too."
echo "  - Press Ctrl-C to stop."
echo ""
if [ -z "$ip" ]; then
  echo "  No Wi-Fi address found (are you on Wi-Fi?). Replace <your-computer-ip> with this computer's address."
  echo ""
fi

if [ "$print_only" = 1 ]; then exit 0; fi
cd "$root"
exec env GAMO_DEV_LAN=1 GAMO_DEV_PHONE_TOKEN="$secret" pnpm --filter apps-admin run dev
