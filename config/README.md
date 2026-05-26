# Qubibyte HMI configuration

## `settings.default.json`

Template defaults shipped with the app. On first launch, Electron copies these values into the per-user settings file.

## Runtime settings (persists across reboots)

| Platform | Location |
|----------|----------|
| Windows | `%APPDATA%/qubibyte-hmi/settings.json` |
| macOS | `~/Library/Application Support/qubibyte-hmi/settings.json` |
| Linux / Raspberry Pi | `~/.config/qubibyte-hmi/settings.json` |

Theme and display preferences are saved there automatically when changed in **Settings**.

## Embedded apps (Circuit Builder, NMR, Website, Tutorial)

These load live from `QubibyteWebsite/` via `qubibyte://local/...` (e.g. `simulator/index.html`, `nmr/index.html`, `careers/index.html`). Replace the whole `QubibyteWebsite` folder anytime — no HMI rebuild required.

Internal links like `/careers/` resolve to `careers/index.html` automatically.

The HMI **MENU** button sits outside the iframe; nothing inside `QubibyteWebsite/` is modified.

Tutorial progress is stored by the website tutorial engine (`qubibyte_tutorial_state`, `qubibyte_exam_data`) and persists across reboots.
