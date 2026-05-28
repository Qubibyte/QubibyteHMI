#!/usr/bin/env bash
# Remove duplicate Qubibyte desktop entries and create one valid launcher.
set -euo pipefail

INSTALL_DIR="${QUBIBYTE_INSTALL_DIR:-$HOME/QubibyteHMI}"
RUN_SCRIPT="$INSTALL_DIR/scripts/run-qubibyte-hmi.sh"
RUN_BIN="$INSTALL_DIR/release/raspberry-pi/current/QubibyteHMI"
ICON="$INSTALL_DIR/media/fav.png"
MENU_FILE="$HOME/.local/share/applications/qubibyte-hmi.desktop"

log() { echo "[fix-pi-desktop] $*"; }

resolve_exec() {
  if [[ -x "$RUN_SCRIPT" ]]; then
    echo "$RUN_SCRIPT"
  elif [[ -x "$RUN_BIN" ]]; then
    echo "$RUN_BIN"
  else
    echo ""
  fi
}

resolve_desktop_dirs() {
  local dirs=()
  if command -v xdg-user-dir >/dev/null 2>&1; then
    local xdg
    xdg="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
    [[ -n "$xdg" ]] && dirs+=("$xdg")
  fi
  dirs+=("$HOME/Desktop" "$HOME/desktop")
  printf '%s\n' "${dirs[@]}" | awk '!seen[$0]++'
}

EXEC_PATH="$(resolve_exec)"
if [[ -z "$EXEC_PATH" ]]; then
  echo "Launcher not found. Expected one of:" >&2
  echo "  $RUN_SCRIPT" >&2
  echo "  $RUN_BIN" >&2
  exit 1
fi

chmod +x "$RUN_SCRIPT" 2>/dev/null || true
chmod +x "$RUN_BIN" 2>/dev/null || true

[[ -f "$ICON" ]] || ICON="application-default-icon"

log "Removing old Qubibyte .desktop files..."
while IFS= read -r dir; do
  [[ -d "$dir" ]] || continue
  find "$dir" -maxdepth 1 -iname '*qubibyte*.desktop' -print -delete 2>/dev/null || true
done < <(resolve_desktop_dirs)
find "$HOME/.local/share/applications" /usr/share/applications 2>/dev/null \
  -iname '*qubibyte*.desktop' -print -delete 2>/dev/null || true

write_desktop_file() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  cat >"$dest" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=QubibyteHMI
Comment=Qubibyte Human Machine Interface
Exec=$EXEC_PATH
Icon=$ICON
Terminal=false
Categories=Utility;
StartupNotify=true
EOF
  chmod 644 "$dest"
  if command -v gio >/dev/null 2>&1; then
    gio set "$dest" metadata::trusted true 2>/dev/null || true
  fi
}

PRIMARY_DESKTOP=""
while IFS= read -r dir; do
  [[ -d "$dir" ]] || mkdir -p "$dir"
  dest="$dir/QubibyteHMI.desktop"
  write_desktop_file "$dest"
  log "Wrote $dest"
  [[ -z "$PRIMARY_DESKTOP" ]] && PRIMARY_DESKTOP="$dest"
done < <(resolve_desktop_dirs)

write_desktop_file "$MENU_FILE"
log "Wrote $MENU_FILE (application menu)"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

log "Exec=$EXEC_PATH"
log "If no icon on the desktop wallpaper, open the menu ( raspberry ) → Utilities → QubibyteHMI"
log "Pi OS: Preferences → Desktop → enable desktop icons if the folder has QubibyteHMI.desktop but nothing shows."
