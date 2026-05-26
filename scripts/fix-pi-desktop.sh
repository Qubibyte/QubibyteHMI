#!/usr/bin/env bash
# Remove duplicate Qubibyte desktop entries and create one valid launcher.
set -euo pipefail

INSTALL_DIR="${QUBIBYTE_INSTALL_DIR:-$HOME/QubibyteHMI}"
DESKTOP_FILE="$HOME/Desktop/QubibyteHMI.desktop"
RUN_SCRIPT="$INSTALL_DIR/scripts/run-qubibyte-hmi.sh"
ICON="$INSTALL_DIR/media/fav.png"

log() { echo "[fix-pi-desktop] $*"; }

log "Removing old Qubibyte .desktop files..."
find "$HOME/Desktop" "$HOME/.local/share/applications" /usr/share/applications 2>/dev/null \
  -iname '*qubibyte*.desktop' ! -path "$DESKTOP_FILE" -print -delete 2>/dev/null || true

[[ -x "$RUN_SCRIPT" ]] || { echo "Launcher not found at $RUN_SCRIPT — run scripts/install-qubibyte-pi.sh first" >&2; exit 1; }
chmod +x "$RUN_SCRIPT" 2>/dev/null || true

mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=QubibyteHMI
Comment=Qubibyte Human Machine Interface
Exec=$RUN_SCRIPT
Icon=$ICON
Terminal=false
Categories=Utility;
StartupNotify=true
EOF

chmod 644 "$DESKTOP_FILE"

if command -v gio >/dev/null 2>&1; then
  gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
fi

log "Created $DESKTOP_FILE (mode 644, Exec has no spaces)"
