#!/usr/bin/env bash
# Install or update Qubibyte HMI on Raspberry Pi (Electron arm64 build).
# Run on the Pi: bash scripts/install-qubibyte-pi.sh
# One-liner (after pushing to GitHub):
#   curl -fsSL https://raw.githubusercontent.com/Qubibyte/QubibyteHMI/main/scripts/install-qubibyte-pi.sh | bash

set -euo pipefail

REPO_URL="${QUBIBYTE_REPO_URL:-https://github.com/Qubibyte/QubibyteHMI.git}"
INSTALL_DIR="${QUBIBYTE_INSTALL_DIR:-$HOME/QubibyteHMI}"
DESKTOP_FILE="$HOME/Desktop/QubibyteHMI.desktop"
RUN_BIN="$INSTALL_DIR/release/raspberry-pi/current/QubibyteHMI"

log() { echo "[qubibyte-pi] $*"; }
die() { echo "[qubibyte-pi] ERROR: $*" >&2; exit 1; }

if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  log "Warning: expected ARM64 (Pi 4/5); continuing anyway."
fi

log "Installing apt dependencies..."
sudo apt-get update -qq
sudo apt-get install -y \
  git curl ca-certificates \
  libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils \
  libatspi2.0-0 libuuid1 libsecret-1-0

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]]; then
  log "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

log "Node $(node -v) / npm $(npm -v)"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "Updating existing clone in $INSTALL_DIR"
  cd "$INSTALL_DIR"
  git pull --ff-only
  git submodule update --init --recursive
else
  log "Cloning $REPO_URL → $INSTALL_DIR"
  git clone --recurse-submodules "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

[[ -f QubibyteWebsite/index.html ]] || die "QubibyteWebsite/index.html missing. Run: git submodule update --init --recursive"

log "Installing LED udev rules (optional; requires logout after first install)..."
if [[ -f scripts/99-qubibyte-led.rules ]]; then
  sudo cp scripts/99-qubibyte-led.rules /etc/udev/rules.d/99-qubibyte-led.rules
  sudo groupadd -f led
  sudo usermod -aG led "$USER" 2>/dev/null || true
  sudo udevadm control --reload-rules
  sudo udevadm trigger
fi

log "npm install..."
npm install

log "Building Raspberry Pi Electron package (arm64 tar.gz)..."
npm run build:raspberry-pi

ARTIFACT="$(ls -1t release/raspberry-pi/QubibyteHMI-*-arm64.tar.gz 2>/dev/null | head -1)"
[[ -n "$ARTIFACT" ]] || die "No release/raspberry-pi/QubibyteHMI-*-arm64.tar.gz found after build"

EXTRACT_ROOT="$INSTALL_DIR/release/raspberry-pi/current"
rm -rf "$EXTRACT_ROOT"
mkdir -p "$EXTRACT_ROOT"
tar -xzf "$ARTIFACT" -C "$EXTRACT_ROOT" --strip-components=1

[[ -x "$RUN_BIN" ]] || die "Extracted binary missing: $RUN_BIN"

log "Pruning old Pi build artifacts..."
find "$INSTALL_DIR/release/raspberry-pi" -maxdepth 1 -name 'QubibyteHMI-*-arm64.tar.gz' ! -newer "$ARTIFACT" -delete 2>/dev/null || true
find "$HOME" -maxdepth 3 -type f -name 'QubibyteHMI*.AppImage' -delete 2>/dev/null || true

log "Creating desktop launcher..."
bash "$INSTALL_DIR/scripts/fix-pi-desktop.sh"

log "Done. Launch from Desktop icon QubibyteHMI or run: $RUN_BIN"
log "Website updates: git pull && git submodule update --init --recursive (no rebuild required if only QubibyteWebsite changed)."
