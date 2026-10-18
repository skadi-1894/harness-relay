#!/usr/bin/env bash
# Copyright (c) 2026 Gavriel, MIT (licenses/third-party-auth-MIT.txt).
set -euo pipefail
umask 077
output=${1:?output path required}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
: "${CLAUDE_EXECUTABLE:?Claude executable is required}"
command -v script >/dev/null || { echo "script(1) is required for subscription sign-in." >&2; exit 1; }
capture=$(mktemp -t claude-setup-token.XXXXXX)
trap 'rm -f "$capture"' EXIT
echo "Complete the Claude browser sign-in. The credential will be saved in the dedicated auth volume."
if script --version 2>/dev/null | grep -q util-linux; then
  script -q -e -c 'exec "$CLAUDE_EXECUTABLE" setup-token' "$capture"
else
  script -q "$capture" "$CLAUDE_EXECUTABLE" setup-token
fi
token=$(node "$script_dir/../dist/auth/helpers/captured-token.js" claude "$capture" || true)
if [[ -z "$token" ]]; then
  echo "No Claude OAuth token was captured." >&2
  exit 1
fi
printf %s "$token" > "$output"
