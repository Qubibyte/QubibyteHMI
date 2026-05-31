# Build Instructions for Qubibyte HMI

Electron app (not Tauri). Website content lives in the **QubibyteWebsite** git submodule.

## Prerequisites

- **Node.js 20+** (Node 22 LTS recommended on Pi and CI)
- **npm 10+**
- **Git submodule** initialized: `git submodule update --init --recursive`

```bash
node --version   # v20.x or v22.x
npm --version
test -f QubibyteWebsite/index.html || echo "Run: git submodule update --init --recursive"
```

### Submodule (required)

| Item | Value |
|------|--------|
| Path | `QubibyteWebsite/` |
| URL | `https://github.com/Qubibyte/QubibyteWebsite.git` |

After pushing website changes:

1. Push in `QubibyteWebsite` repo  
2. In this repo: `git add QubibyteWebsite` → commit “Bump submodule” → push  
3. On Pi: `git pull && git submodule update --init --recursive`

Website-only updates on a dev tree that serves files from disk may not require a full Electron rebuild. Packaged installs use the copy bundled at build time.

## Build Output Layout

```
release/
├── web.config          (keeps IIS from touching build files)
├── windows/            ← portable .exe (no installer)
└── raspberry-pi/       ← arm64 .tar.gz (and .deb when built on Linux)
```

Intermediate files are staged in temp; only installable artifacts remain in `release/`.

## Building from Windows

### Windows portable executable

```bash
npm install
npm run build:win64
```

Output: `release/windows/QubibyteHMI-1.0.0.exe` — double-click to run.

### Raspberry Pi (ARM64) from Windows

```bash
npm run build:raspberry-pi
```

Output: `release/raspberry-pi/QubibyteHMI-1.0.0-arm64.tar.gz`

Copy to the Pi, extract, and run `./QubibyteHMI`, or use the install script below.

> **Do not** run `npm run build:raspberry-pi:deb` on Windows — electron-builder hangs on `.deb` packaging.

### Windows + Pi in one command

```bash
npm run build:windows-and-pi
```

## Building on Raspberry Pi 5

### Automated install / update

```bash
git clone --recurse-submodules https://github.com/Qubibyte/QubibyteHMI.git ~/QubibyteHMI
cd ~/QubibyteHMI
bash scripts/install-qubibyte-pi.sh
```

One-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/Qubibyte/QubibyteHMI/master/scripts/install-qubibyte-pi.sh | bash
```

This installs apt deps, Node 22, verifies the submodule, builds the arm64 package, creates **one** desktop icon (`~/Desktop/QubibyteHMI.desktop`), and installs optional LED udev rules.

Fix duplicate desktop icons:

```bash
bash scripts/fix-pi-desktop.sh
```

### Manual build

```bash
cd ~/QubibyteHMI
git pull && git submodule update --init --recursive
npm install
npm run build:raspberry-pi          # tar.gz
npm run build:raspberry-pi:deb      # .deb (Linux/Pi only)
```

## GitHub Actions (CI)

Push to `main`/`master`. Workflows check out submodules and verify `QubibyteWebsite/index.html` before building.

| Job | Artifacts |
|-----|-----------|
| `build-windows` | `release/windows/*.exe`, `release/raspberry-pi/*.tar.gz` |
| `build-pi-deb` | `release/raspberry-pi/*.deb` |

## Running builds

### Windows

`release/windows/QubibyteHMI-X.X.X.exe`

### Raspberry Pi (manual extract)

```bash
tar -xzf QubibyteHMI-*-arm64.tar.gz
cd QubibyteHMI-*-arm64
./QubibyteHMI
```

Installed layout from `install-qubibyte-pi.sh`:

- Binary: `~/QubibyteHMI/release/raspberry-pi/current/QubibyteHMI`
- Desktop: `~/Desktop/QubibyteHMI.desktop` → `scripts/run-qubibyte-hmi.sh` (644, not executable)

## Development

```bash
npm install
git submodule update --init --recursive
npm start          # windowed testing (TESTING_MODE in main.js)
npm run dev        # same with --dev flag

Testing uses a **1280×720 web viewport** (`useContentSize`), matching Pi 720p layout. The outer window is slightly taller on Windows because of the title bar; the page area matches the device.
```

- HMI pages: `qubibyte://local/hmi/…`
- Website embed: `qubibyte://local/…` plus loopback HTTP for YouTube embeds
- Production kiosk: no context menu / DevTools; mouse back/forward blocked; MENU → main menu (`#menu`, no splash)

## Raspberry Pi onboard LED

Diagnostics page only (not main-menu logo). Installed automatically by `install-qubibyte-pi.sh` (brightness **and** trigger sysfs). Manual fix:

```bash
bash scripts/setup-pi-led-permissions.sh
# log out and back in once
```

## Auto-start (systemd)

```ini
[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/QubibyteHMI/release/raspberry-pi/current
ExecStart=/home/pi/QubibyteHMI/scripts/run-qubibyte-hmi.sh
Restart=always
RestartSec=5
Environment=DISPLAY=:0
Environment=HOME=/home/pi
```

## Troubleshooting

### Website routes show “Not Found”

Submodule missing: `git submodule update --init --recursive`

### Pi build hangs on Windows

You are building `.deb`. Use `npm run build:raspberry-pi` only.

### Invalid desktop entry on Pi

`.desktop` files must be mode **644** (not `chmod +x`). Run `bash scripts/fix-pi-desktop.sh`.

### EBUSY during build under IIS

`npm run clean` then rebuild; stop IIS if needed.

### Clean outputs

```bash
npm run clean
```

### LED toggle fails on Pi

Add user to `led` group and re-login; confirm `/sys/class/leds/ACT` or `led0` exists.
