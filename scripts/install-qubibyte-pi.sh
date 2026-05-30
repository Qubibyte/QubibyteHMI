#!/usr/bin/env bash
# Install or update Qubibyte HMI on Raspberry Pi (Electron arm64 build).
# Run on the Pi: bash scripts/install-qubibyte-pi.sh
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/Qubibyte/QubibyteHMI/master/scripts/install-qubibyte-pi.sh | bash

set -euo pipefail

REPO_URL="${QUBIBYTE_REPO_URL:-https://github.com/Qubibyte/QubibyteHMI.git}"
GIT_BRANCH="${QUBIBYTE_GIT_BRANCH:-master}"
INSTALL_DIR="${QUBIBYTE_INSTALL_DIR:-$HOME/QubibyteHMI}"
RUN_BIN="$INSTALL_DIR/release/raspberry-pi/current/QubibyteHMI"
LOG_FILE="${QUBIBYTE_INSTALL_LOG:-$HOME/qubibyte-pi-install.log}"

log() { echo "[qubibyte-pi] $*"; }
die() { echo "[qubibyte-pi] ERROR: $*" >&2; exit 1; }

exec > >(tee -a "$LOG_FILE") 2>&1
log "Logging to $LOG_FILE"

if [[ "$(uname -m)" != "aarch64" && "$(uname -m)" != "arm64" ]]; then
  log "Warning: expected ARM64 (Pi 4/5); continuing anyway."
fi

cleanup_previous_binaries() {
  log "Removing old Qubibyte HMI binaries (keeping desktop icon until new build succeeds)..."

  if pgrep -x QubibyteHMI >/dev/null 2>&1; then
    log "Stopping running QubibyteHMI..."
    pkill -x QubibyteHMI 2>/dev/null || true
    sleep 1
  fi

  if [[ -d "$INSTALL_DIR/release/raspberry-pi" ]]; then
    find "$INSTALL_DIR/release/raspberry-pi" -maxdepth 1 -mindepth 1 \
      ! -name 'current' \
      ! -name 'QubibyteHMI-*-arm64.tar.gz' \
      -print -exec rm -rf {} + 2>/dev/null || true
  fi

  find "$HOME" -maxdepth 2 -type d -name 'QubibyteHMI-*-arm64' \
    -print -exec rm -rf {} + 2>/dev/null || true

  find "$HOME" -maxdepth 4 -type f -name 'QubibyteHMI' -executable \
    ! -path "$INSTALL_DIR/release/raspberry-pi/current/*" \
    -print -delete 2>/dev/null || true

  find "$HOME" -maxdepth 3 -type f -name 'QubibyteHMI*.AppImage' \
    -print -delete 2>/dev/null || true
}

sync_repo() {
  if [[ -d "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
    log "Existing $INSTALL_DIR is not a git clone — removing for fresh install"
    rm -rf "$INSTALL_DIR"
  fi

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    log "Updating existing clone in $INSTALL_DIR (branch $GIT_BRANCH)"
    cd "$INSTALL_DIR"
    git fetch origin "$GIT_BRANCH"
    if ! git pull --ff-only origin "$GIT_BRANCH"; then
      log "Fast-forward pull failed — resetting to origin/$GIT_BRANCH"
      git reset --hard "origin/$GIT_BRANCH"
    fi
  else
    log "Cloning $REPO_URL → $INSTALL_DIR"
    git clone --recurse-submodules -b "$GIT_BRANCH" "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  git submodule sync --recursive
  git submodule update --init --recursive

  log "HMI commit: $(git rev-parse --short HEAD)"
  if [[ -d QubibyteWebsite/.git ]]; then
    log "QubibyteWebsite commit: $(git -C QubibyteWebsite rev-parse --short HEAD)"
  fi
}

setup_led_permissions() {
  log "Installing onboard LED permissions (Diagnostics LED toggle)..."
  if [[ -x "$INSTALL_DIR/scripts/setup-pi-led-permissions.sh" ]]; then
    bash "$INSTALL_DIR/scripts/setup-pi-led-permissions.sh"
  elif [[ -f "$INSTALL_DIR/scripts/99-qubibyte-led.rules" ]]; then
    sudo cp "$INSTALL_DIR/scripts/99-qubibyte-led.rules" /etc/udev/rules.d/99-qubibyte-led.rules
    sudo groupadd -f led
    sudo usermod -aG led "$USER" 2>/dev/null || true
    sudo udevadm control --reload-rules
    sudo udevadm trigger --subsystem-match=leds
  else
    log "Warning: LED rules not found — skipping LED permission setup"
  fi
}

verify_install() {
  log "=== install verification ==="
  if [[ -x "$RUN_BIN" ]]; then
    log "Binary OK: $RUN_BIN"
    ls -la "$RUN_BIN"
  else
    die "Binary missing: $RUN_BIN"
  fi

  local found_desktop=0
  local dirs=()
  if command -v xdg-user-dir >/dev/null 2>&1; then
    local xdg
    xdg="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
    [[ -n "$xdg" ]] && dirs+=("$xdg")
  fi
  dirs+=("$HOME/Desktop" "$HOME/desktop")

  local dir f
  for dir in "${dirs[@]}"; do
    f="$dir/QubibyteHMI.desktop"
    if [[ -f "$f" ]]; then
      log "Desktop launcher OK: $f"
      found_desktop=1
    fi
  done

  if [[ -f "$HOME/.local/share/applications/qubibyte-hmi.desktop" ]]; then
    log "Menu launcher OK: $HOME/.local/share/applications/qubibyte-hmi.desktop"
    found_desktop=1
  fi

  if [[ "$found_desktop" -eq 0 ]]; then
    log "Warning: no .desktop file found — run: bash $INSTALL_DIR/scripts/fix-pi-desktop.sh"
  else
    log "Launch from desktop icon or: $RUN_BIN"
    log "Pi OS: if no icon on wallpaper, open menu → Utilities → QubibyteHMI"
    log "Pi OS: enable desktop icons in Desktop preferences if needed"
  fi
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

sync_repo

[[ -f "$INSTALL_DIR/QubibyteWebsite/index.html" ]] || die "QubibyteWebsite/index.html missing. Run: git submodule update --init --recursive"

cleanup_previous_binaries
setup_led_permissions

log "npm install..."
cd "$INSTALL_DIR"
npm install

log "Building Raspberry Pi Electron package (arm64 tar.gz) — this can take 15–30+ minutes..."
npm run build:raspberry-pi

ARTIFACT="$(ls -1t "$INSTALL_DIR/release/raspberry-pi/QubibyteHMI-"*-arm64.tar.gz 2>/dev/null | head -1)"
[[ -n "$ARTIFACT" ]] || die "No release/raspberry-pi/QubibyteHMI-*-arm64.tar.gz found after build"

EXTRACT_ROOT="$INSTALL_DIR/release/raspberry-pi/current"
rm -rf "$EXTRACT_ROOT"
mkdir -p "$EXTRACT_ROOT"
tar -xzf "$ARTIFACT" -C "$EXTRACT_ROOT" --strip-components=1

[[ -x "$RUN_BIN" ]] || die "Extracted binary missing: $RUN_BIN"
chmod +x "$RUN_BIN"
chmod +x "$INSTALL_DIR/scripts/run-qubibyte-hmi.sh" 2>/dev/null || true

log "Pruning old Pi build artifacts..."
find "$INSTALL_DIR/release/raspberry-pi" -maxdepth 1 -name 'QubibyteHMI-*-arm64.tar.gz' ! -newer "$ARTIFACT" \
  -print -delete 2>/dev/null || true

log "Creating desktop launcher..."
bash "$INSTALL_DIR/scripts/fix-pi-desktop.sh"

verify_install
log "Done. Full log: $LOG_FILE"
