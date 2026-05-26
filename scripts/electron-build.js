const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const ARTIFACT_SUFFIXES = ['.exe', '.tar.gz', '.deb', '.dmg', '.AppImage', '.blockmap'];

function resolveTargetSubfolder(args) {
  for (const arg of args) {
    if (arg === '--win' || arg.startsWith('--win=')) return 'windows';
    if (arg === '--mac' || arg.startsWith('--mac=')) return 'mac';
    if (arg === '--linux' || arg.startsWith('--linux=')) return 'raspberry-pi';
  }

  return 'other';
}

function isArtifact(filename) {
  return ARTIFACT_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

function copyArtifacts(stagingDir, finalDir) {
  fs.mkdirSync(finalDir, { recursive: true });

  if (!fs.existsSync(stagingDir)) {
    return [];
  }

  const copied = [];

  for (const entry of fs.readdirSync(stagingDir)) {
    const src = path.join(stagingDir, entry);
    if (!fs.statSync(src).isFile() || !isArtifact(entry)) {
      continue;
    }

    const dest = path.join(finalDir, entry);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }

  return copied;
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }

  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureReleaseWebConfig() {
  const releaseDir = path.join(process.cwd(), 'release');
  const webConfigPath = path.join(releaseDir, 'web.config');

  fs.mkdirSync(releaseDir, { recursive: true });

  if (!fs.existsSync(webConfigPath)) {
    fs.writeFileSync(
      webConfigPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <clear />
    </handlers>
    <security>
      <authorization>
        <add accessType="Deny" users="*" />
      </authorization>
    </security>
  </system.webServer>
</configuration>
`
    );
  }
}

const args = process.argv.slice(2);
const targetSubfolder = resolveTargetSubfolder(args);
const finalDir = path.join(process.cwd(), 'release', targetSubfolder);
const stagingDir = path.join(os.tmpdir(), 'qubibyte-hmi-build', targetSubfolder);

ensureReleaseWebConfig();
removeDir(stagingDir);
fs.mkdirSync(stagingDir, { recursive: true });

console.log(`\nBuilding ${targetSubfolder} → release/${targetSubfolder}/\n`);

const electronBuilder = path.join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);

const result = spawnSync(
  electronBuilder,
  [...args, `-c.directories.output=${stagingDir}`],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false'
    }
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const copied = copyArtifacts(stagingDir, finalDir);
removeDir(stagingDir);

if (copied.length === 0) {
  console.error('\nBuild finished but no installable artifacts were found.');
  process.exit(1);
}

console.log('\nArtifacts:');
for (const file of copied) {
  console.log(`  ${file}`);
}
console.log('');

process.exit(0);
