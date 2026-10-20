#!/bin/sh
# Prints how to reach a local dev server: this computer and, for the public apps, a phone on the same Wi-Fi.
# Usage: scripts/dev/print-urls.sh <web|worship|academy|live|production|admin>
# The port comes from LOCAL_PORTS in packages/config/apps.ts (the single source). The admin is never offered on the
# network from here: its local identity stand-in is for this computer only (`make admin-phone` is the safe way to a
# phone). Every `make dev-<app>` target calls this, so a new app's dev target gets the same output by using it.
set -eu

app="${1:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
port="$(sed -n '/LOCAL_PORTS = {/,/}/p' "$root/packages/config/apps.ts" | sed -n "s/^[[:space:]]*$app:[[:space:]]*\([0-9][0-9]*\).*/\1/p")"
if [ -z "$app" ] || [ -z "$port" ]; then
  echo "usage: print-urls.sh <app> (no port found in packages/config/apps.ts for '$app')" >&2
  exit 1
fi

echo ""
echo "  This computer:      http://127.0.0.1:$port"
if [ "$app" = "admin" ]; then
  echo "  The admin is this computer only. To open it on your phone run: make admin-phone"
else
  ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  echo "  Phone (same Wi-Fi): http://${ip:-<your-computer-ip>}:$port"
  case "$app" in
    live) echo "  Phones allow the camera only on https or localhost: show the guest QR on the phone and scan it here, or type the code." ;;
    *) echo "  Phones allow the camera only on https or localhost, so camera features will not work over the Wi-Fi address." ;;
  esac
fi
echo ""
