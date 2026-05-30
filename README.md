# Qubibyte HMI (Electron)

Human Machine Interface for Qubibyte hardware — **Electron** main process, local `qubibyte://` protocol, and embedded [QubibyteWebsite](https://github.com/Qubibyte/QubibyteWebsite) (git submodule).

## Quick start

```bash
git clone --recurse-submodules https://github.com/Qubibyte/QubibyteHMI.git
cd QubibyteHMI
npm install
npm start
```

If `QubibyteWebsite/` is empty after clone:

```bash
git submodule update --init --recursive
```

## Features

- Startup screen and main menu (splash skipped when returning via MENU / `#menu`)
- Circuit builder, calibration, diagnostics, tutorial (website embed), NMR, settings
- Themes (dark / light / purple) with flash guard
- Windows portable `.exe` and Raspberry Pi arm64 builds
- Pi: onboard LED toggle in **Diagnostics only**; lighter animations on ARM

## Build

See **[BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md)** for Windows portable exe, Pi tar.gz, CI, submodule workflow, and Pi install script.

| Command | Output |
|---------|--------|
| `npm run build:win64` | `release/windows/QubibyteHMI-*.exe` |
| `npm run build:raspberry-pi` | `release/raspberry-pi/QubibyteHMI-*-arm64.tar.gz` |
| `npm run build:windows-and-pi` | Both |

### Raspberry Pi install

```bash
curl -fsSL https://raw.githubusercontent.com/Qubibyte/QubibyteHMI/master/scripts/install-qubibyte-pi.sh | bash
```

Or from a local clone: `bash scripts/install-qubibyte-pi.sh`

## Configuration

Bundled defaults: `config/settings.default.json`  
User overrides: Electron `userData/settings.json` (via Settings page)

Production fullscreen on Pi is automatic. For windowed dev on desktop, set `TESTING_MODE = 1` in `main.js`.

## Project layout

| Path | Role |
|------|------|
| `main.js` | Window, IPC, `qubibyte://` protocol, local HTTP, LED, kiosk guards |
| `preload.js` | `window.electronAPI` bridge |
| `index.html` / `pages/` | HMI UI |
| `js/` | Menu, embed viewer, diagnostics, settings, … |
| `QubibyteWebsite/` | Submodule — **do not edit from HMI tasks unless asked** |
| `scripts/` | Build, Pi install, desktop fix, page generator |

## Submodule workflow

1. Change website in `QubibyteWebsite` → push to `Qubibyte/QubibyteWebsite`  
2. Parent repo: `git add QubibyteWebsite` → commit bump → push  
3. Devices: `git pull && git submodule update --init --recursive`

## Platform notes

- **Raspberry Pi**: thermal sysfs for status bar temp; particle background disabled on main menu; diagnostics LED via sysfs (`ACT` / `led0`)
- **Windows**: portable exe, no installer required
- **Website embed**: `qubibyte://local/…` + `127.0.0.1` HTTP for YouTube referrer requirements

## Legacy removed

- Python Tkinter HMI (`scripts/gui.py`, `libraries/PIL/`) — deleted; fonts in `fonts/` remain for `styles.css`

## Troubleshooting

- **Empty website / 404**: initialize submodule (see above)  
- **Build hangs on Windows**: do not build `.deb` on Windows  
- **Two desktop icons on Pi**: `bash scripts/fix-pi-desktop.sh`  
- Details: [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md)
