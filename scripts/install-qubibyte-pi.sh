#!/usr/bin/env bash
# Install or update Qubibyte HMI on Raspberry Pi (Electron arm64 build).
# Run on the Pi: bash scripts/install-qubibyte-pi.sh
# One-liner (from GitHub main):
#   curl -fsSL https://raw.githubusercontent.com/Qubibyte/QubibyteHMI/main/scripts/install-qubibyte-pi.sh | bash

set -euo pipefail

REPO_URL="${QUBIBYTE_REPO_URL:-https://github.com/Qubibyte/QubibyteHMI.git}"
INSTALL_DIR="${QUBIBYTE_INSTALL_DIR:-$HOME/QubibyteHMI}"
RUN_BIN="$INSTALL_DIR/release/raspberry-pi/current/QubibyteHMI"

log() { echo "[qubibyte-pi] $*"; }
die() { echo "[qubibyte-pi] ERROR: $*" >&2; exit 1; }

if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  log "Warning: expected ARM64 (Pi 4/5); continuing anyway."
fi

remove_qubibyte_desktop_entries() {
  local dirs=()
  if command -v xdg-user-dir >/dev/null 2>&1; then
    local xdg
    xdg="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
    [[ -n "$xdg" ]] && dirs+=("$xdg")
  fi
  dirs+=("$HOME/Desktop" "$HOME/desktop")

  local dir dest
  for dir in "${dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    find "$dir" -maxdepth 1 -iname '*qubibyte*.desktop' -print -delete 2>/dev/null || true
  done
  find "$HOME/.local/share/applications" -maxdepth 1 -iname '*qubibyte*.desktop' \
    -print -delete 2>/dev/null || true
}

cleanup_previous_install() {
  log "Removing old Qubibyte HMI binaries and desktop launchers..."

  if pgrep -x QubibyteHMI >/dev/null 2>&1; then
    log "Stopping running QubibyteHMI..."
    pkill -x QubibyteHMI 2>/dev/null || true
    sleep 1
  fi

  remove_qubibyte_desktop_entries

  # Old versioned extract folders under the install tree (keep current/ until replaced below).
  if [[ -d "$INSTALL_DIR/release/raspberry-pi" ]]; then
    find "$INSTALL_DIR/release/raspberry-pi" -maxdepth 1 -mindepth 1 \
      ! -name 'current' \
      ! -name 'QubibyteHMI-*-arm64.tar.gz' \
      -print -exec rm -rf {} + 2>/dev/null || true
  fi

  # Standalone tar.gz extracts elsewhere in $HOME.
  find "$HOME" -maxdepth 2 -type d -name 'QubibyteHMI-*-arm64' \
    -print -exec rm -rf {} + 2>/dev/null || true

  # Stray executables outside the managed current/ path.
  find "$HOME" -maxdepth 4 -type f -name 'QubibyteHMI' -executable \
    ! -path "$INSTALL_DIR/release/raspberry-pi/current/*" \
    -print -delete 2>/dev/null || true

  find "$HOME" -maxdepth 3 -type f -name 'QubibyteHMI*.AppImage' \
    -print -delete 2>/dev/null || true
}

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

if [[ -d "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
  log "Existing $INSTALL_DIR is not a git clone — removing for fresh install"
  rm -rf "$INSTALL_DIR"
fi

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

cleanup_previous_install

log "Installing onboard LED permissions (Diagnostics LED toggle)..."
bash "$INSTALL_DIR/scripts/setup-pi-led-permissions.sh"

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
chmod +x "$RUN_BIN"

log "Pruning old Pi build artifacts..."
find "$INSTALL_DIR/release/raspberry-pi" -maxdepth 1 -name 'QubibyteHMI-*-arm64.tar.gz' ! -newer "$ARTIFACT" \
  -print -delete 2>/dev/null || true

log "Creating desktop launcher..."
bash "$INSTALL_DIR/scripts/fix-pi-desktop.sh"

log "Done. Launch from Desktop icon QubibyteHMI or run: $RUN_BIN"
log "LED: log out and back in once if Diagnostics still says permission denied."
log "Updates: re-run this script, or: cd $INSTALL_DIR && git pull && bash scripts/install-qubibyte-pi.sh"
