#!/usr/bin/env bash
# One-command demo: build the dashboard, copy it into the gateway, start the gateway.
#   ./run-demo.sh          -> real hardware on the serial port in gateway/appsettings.json
#   ./run-demo.sh --sim    -> simulated rows only (no hardware needed)
set -euo pipefail
cd "$(dirname "$0")"

# Homebrew's dotnet@8 is keg-only; make it visible if it isn't already.
if ! command -v dotnet >/dev/null 2>&1 && [ -d /opt/homebrew/opt/dotnet@8/bin ]; then
  export PATH="/opt/homebrew/opt/dotnet@8/bin:$PATH"
  export DOTNET_ROOT="/opt/homebrew/opt/dotnet@8/libexec"
fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1

echo "==> Building dashboard"
(cd dashboard && [ -d node_modules ] || npm install --silent)
(cd dashboard && npm run build --silent)
rm -rf gateway/wwwroot
cp -R dashboard/dist gateway/wwwroot

echo "==> Starting gateway ($*)"
echo "    open http://localhost:5080"
cd gateway && exec dotnet run -- "$@"
