const fs = require('fs');
const path = require('path');

const desktopRoot = path.join(__dirname, '..');
const workspaceRoot = path.join(desktopRoot, '..');
const releaseDir = path.join(desktopRoot, 'release');
const downloadsDir = path.join(workspaceRoot, 'frontend', 'public', 'downloads');
const files = ['Shield-Setup.exe', 'Shield-Setup.exe.blockmap', 'latest.yml'];

fs.mkdirSync(downloadsDir, { recursive: true });

for (const fileName of files) {
  const sourcePath = path.join(releaseDir, fileName);
  if (!fs.existsSync(sourcePath)) {
    console.warn(`Skipped ${fileName}; ${sourcePath} does not exist.`);
    continue;
  }

  fs.copyFileSync(sourcePath, path.join(downloadsDir, fileName));
}

console.log(`Copied desktop update artifacts to ${downloadsDir}.`);
