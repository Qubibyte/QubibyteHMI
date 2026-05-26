#!/usr/bin/env bash
# Stable launcher path for .desktop (no spaces). Resolves install dir from script location.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec "$ROOT/release/raspberry-pi/current/QubibyteHMI" "$@"
