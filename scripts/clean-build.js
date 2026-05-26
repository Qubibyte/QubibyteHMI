const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const LEGACY_RELEASE_ENTRIES = [
  'linux-arm64-unpacked',
  'linux-arm64-unpacked.tmp',
  'win-unpacked',
  'builder-debug.yml',
  'builder-effective-config.yaml',
  'qubibyte-hmi-1.0.0-arm64.tar.gz'
];

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return true;
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    try {
      execSync(`npx rimraf "${dir}"`, { stdio: 'pipe', shell: true });
      return true;
    } catch {
      return false;
    }
  }
}

function cleanLegacyReleaseRoot() {
  const releaseRoot = path.join(process.cwd(), 'release');

  for (const entry of LEGACY_RELEASE_ENTRIES) {
    const target = path.join(releaseRoot, entry);
    if (!removeDir(target)) {
      console.warn(`Warning: could not remove legacy ${entry} (IIS may have it locked — safe to ignore)`);
    }
  }
}

const dirs = [
  path.join(process.cwd(), 'release', 'windows'),
  path.join(process.cwd(), 'release', 'raspberry-pi'),
  path.join(process.cwd(), 'release', 'mac'),
  path.join(process.cwd(), 'release', 'other'),
  path.join(process.cwd(), 'dist'),
  path.join(os.tmpdir(), 'qubibyte-hmi-build'),
  path.join(process.env.LOCALAPPDATA || os.homedir(), 'qubibyte-hmi-build')
];

cleanLegacyReleaseRoot();

for (const dir of dirs) {
  if (!removeDir(dir)) {
    console.warn(`Warning: could not fully clean ${dir}`);
  }
}

console.log('Cleaned release/windows, release/raspberry-pi, and build caches.');
