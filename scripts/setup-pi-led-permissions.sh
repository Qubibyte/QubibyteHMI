#!/usr/bin/env bash
# Pi onboard LED permissions for Qubibyte HMI Diagnostics (brightness + trigger sysfs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RULES_SRC="$ROOT/scripts/99-qubibyte-led.rules"
RULES_DEST="/etc/udev/rules.d/99-qubibyte-led.rules"

log() { echo "[qubibyte-led] $*"; }

[[ -f "$RULES_SRC" ]] || { echo "Missing $RULES_SRC" >&2; exit 1; }

log "Installing udev rules → $RULES_DEST"
sudo cp "$RULES_SRC" "$RULES_DEST"

sudo groupadd -f led
sudo usermod -aG led "${USER:-$(whoami)}" 2>/dev/null || true
sudo usermod -aG led pi 2>/dev/null || true

sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=leds

for led in /sys/class/leds/ACT /sys/class/leds/led0; do
  if [[ -d "$led" ]]; then
    sudo chmod 666 "$led/brightness" "$led/trigger" 2>/dev/null || true
    log "Applied permissions on $led"
  fi
done

log "Done. Log out and back in once if Diagnostics still reports permission errors."
