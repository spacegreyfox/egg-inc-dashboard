#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 24 from https://nodejs.org/ then open this launcher again.'
  printf '%s\n' 'Press Return to close.'
  read -r answer
  exit 1
fi
exec node scripts/start.mjs --demo
