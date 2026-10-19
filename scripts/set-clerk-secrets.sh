#!/usr/bin/env bash
# Sets the Clerk secrets of the public apps on Cloudflare from each app's .dev.vars, using
# `wrangler secret put` with the value piped on stdin. Nothing but "ok <app> <NAME>" is printed;
# values never reach the terminal, a log or an argument list.
#
#   scripts/set-clerk-secrets.sh --env preview|production [--app web|worship|academy|live|production]...
#                                [--file PATH] [--dry-run]
#
#   --env      required. production also requires a person at an interactive terminal who types
#              "production"; there is no flag to skip that, and it is refused when run by a test or CI.
#   --app      limit to one or more apps (default: all five public apps).
#   --file     read this file instead of apps/<app>/.dev.vars (needs exactly one --app).
#   --dry-run  check the files and print what would be set; call nothing remote.
#
# Names set per app (APP is WEB, WORSHIP, ACADEMY, LIVE or PRODUCTION; docs/AUTH.md):
#   PUBLIC_CLERK_PUBLISHABLE_KEY_APP  CLERK_SECRET_KEY_APP  CLERK_JWT_KEY_APP  CLERK_ISSUER_APP
# The file may hold either those names or Clerk's un-suffixed names (PUBLIC_CLERK_PUBLISHABLE_KEY, …);
# the suffixed name is always what is set. A missing issuer is derived from the publishable key.
# Quoted values, multi-line PEM keys and PEM keys written on one line with literal \n are all handled.
#
# For production the publishable key must start with pk_live_ and the secret key (if given) with
# sk_live_ (Production instance keys); anything else, and the same publishable, secret or JWT key
# for two products, is refused before anything is set.
#
# WRANGLER_BIN overrides the command (default: pnpm exec wrangler) and CLERK_APPS_DIR the apps folder.
# When started by a test (NODE_TEST_CONTEXT) or CI, WRANGLER_BIN must be a stub executable in the temp
# directory, and --env production only works with --dry-run.

set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper=(pnpm --silent exec tsx "$repo_root/scripts/clerk/dotenv-value.ts")
read -r -a wrangler <<<"${WRANGLER_BIN:-pnpm exec wrangler}"

all_apps=(web worship academy live production)
kinds=(publishable secret jwt issuer)

usage() { sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; }
fail() { echo "error: $*" >&2; exit 1; }

env_name=""
file_override=""
dry_run=0
apps=()

while [ $# -gt 0 ]; do
  case "$1" in
    --env) env_name="${2:-}"; shift 2 ;;
    --app) apps+=("${2:-}"); shift 2 ;;
    --file) file_override="${2:-}"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; fail "unknown argument: $1" ;;
  esac
done

case "$env_name" in preview|production) ;; *) usage; fail "--env preview|production is required" ;; esac
[ ${#apps[@]} -gt 0 ] || apps=("${all_apps[@]}")
for app in "${apps[@]}"; do
  case " ${all_apps[*]} " in *" $app "*) ;; *) fail "unknown app: $app (admin does not use Clerk)" ;; esac
done

# ---- 0. never reach the real account or a prompt from automation ------------------------------
automated=0
[ -z "${NODE_TEST_CONTEXT:-}" ] && [ -z "${CI:-}" ] || automated=1
if [ "$automated" -eq 1 ]; then
  tmp_root="${TMPDIR:-/tmp}"; tmp_root="${tmp_root%/}"
  case "${WRANGLER_BIN:-}" in
    "$tmp_root"/*|/tmp/*|/private/tmp/*) ;;
    *) fail "started by a test or CI: WRANGLER_BIN must be a stub in the temp directory; the real wrangler is never used" ;;
  esac
  [ -f "$WRANGLER_BIN" ] && [ -x "$WRANGLER_BIN" ] || fail "started by a test or CI: WRANGLER_BIN is not an executable stub"
fi
if [ "$env_name" = "production" ] && [ "$dry_run" -ne 1 ]; then
  [ "$automated" -eq 0 ] || fail "started by a test or CI: --env production is refused (use --dry-run)"
  [ -t 0 ] && [ -r /dev/tty ] || fail "--env production needs a person at an interactive terminal; nothing was set"
fi

if [ -n "$file_override" ]; then
  [ ${#apps[@]} -eq 1 ] || fail "--file needs exactly one --app"
  [ -f "$file_override" ] || fail "file not found: $file_override"
fi

apps_dir="${CLERK_APPS_DIR:-$repo_root/apps}"
file_for() { if [ -n "$file_override" ]; then echo "$file_override"; else echo "$apps_dir/$1/.dev.vars"; fi; }
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
secret_name() {
  local suffix; suffix="$(upper "$1")"
  case "$2" in
    publishable) echo "PUBLIC_CLERK_PUBLISHABLE_KEY_$suffix" ;;
    secret) echo "CLERK_SECRET_KEY_$suffix" ;;
    jwt) echo "CLERK_JWT_KEY_$suffix" ;;
    issuer) echo "CLERK_ISSUER_$suffix" ;;
  esac
}

# ---- 1. validate everything before anything is set -------------------------------------------
problems=0
seen_fingerprints=""
for app in "${apps[@]}"; do
  file="$(file_for "$app")"
  if [ ! -f "$file" ]; then
    echo "skip $app: $file not found" >&2
    problems=$((problems + 1))
    continue
  fi
  for kind in "${kinds[@]}"; do
    state="$("${helper[@]}" check "$file" "$app" "$kind")"
    name="$(secret_name "$app" "$kind")"
    if [ "$state" = "missing" ]; then
      case "$kind" in
        publishable) echo "missing $app $name" >&2; problems=$((problems + 1)) ;;
        secret|jwt) echo "missing $app $name" >&2 ;;  # one of the two is enough, checked below
        issuer) echo "missing $app $name (cannot be derived: publishable key missing or malformed)" >&2; problems=$((problems + 1)) ;;
      esac
      continue
    fi
    if [ "$env_name" = "production" ] && { [ "$kind" = "publishable" ] || [ "$kind" = "secret" ]; } && [ "$state" != "live" ]; then
      echo "refused $app $name: --env production needs a Production instance key (pk_live_/sk_live_)" >&2
      problems=$((problems + 1))
    fi
    if [ "$kind" != "issuer" ]; then
      fp="$("${helper[@]}" fingerprint "$file" "$app" "$kind")"
      if printf '%s\n' "$seen_fingerprints" | grep -q "^$fp "; then
        echo "refused $app $name: the same key is used by another product (each product needs its own Clerk application)" >&2
        problems=$((problems + 1))
      fi
      seen_fingerprints="$seen_fingerprints$fp $app $kind"$'\n'
    fi
  done
  if [ "$("${helper[@]}" check "$file" "$app" secret)" = "missing" ] && [ "$("${helper[@]}" check "$file" "$app" jwt)" = "missing" ]; then
    echo "missing $app: needs $(secret_name "$app" secret) or $(secret_name "$app" jwt)" >&2
    problems=$((problems + 1))
  fi
done
[ "$problems" -eq 0 ] || fail "$problems problem(s) above; nothing was set"

if [ "$dry_run" -eq 1 ]; then
  for app in "${apps[@]}"; do
    file="$(file_for "$app")"
    for kind in "${kinds[@]}"; do
      [ "$("${helper[@]}" check "$file" "$app" "$kind")" = "missing" ] || echo "would set $app $(secret_name "$app" "$kind") --env $env_name"
    done
  done
  exit 0
fi

# ---- 2. confirm (production) ------------------------------------------------------------------
if [ "$env_name" = "production" ]; then
  printf 'This changes PRODUCTION secrets for: %s\nType "production" to continue: ' "${apps[*]}" >/dev/tty
  read -r answer </dev/tty
  [ "$answer" = "production" ] || fail "not confirmed; nothing was set"
fi

# ---- 3. set -------------------------------------------------------------------------------------
failures=0
for app in "${apps[@]}"; do
  file="$(file_for "$app")"
  for kind in "${kinds[@]}"; do
    [ "$("${helper[@]}" check "$file" "$app" "$kind")" != "missing" ] || continue
    name="$(secret_name "$app" "$kind")"
    if "${helper[@]}" value "$file" "$app" "$kind" | (cd "$apps_dir/$app" && "${wrangler[@]}" secret put "$name" --env "$env_name" >/dev/null); then
      echo "ok $app $name"
    else
      echo "failed $app $name" >&2
      failures=$((failures + 1))
    fi
  done
done
[ "$failures" -eq 0 ] || fail "$failures secret(s) could not be set"
