const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const desktopRoot = path.join(__dirname, '..');
const packageJson = require(path.join(desktopRoot, 'package.json'));
const releaseDir = path.join(desktopRoot, 'release');
const installerName = 'Shield-Setup.exe';
const installerPath = path.join(releaseDir, installerName);
const latestPath = path.join(releaseDir, 'latest.yml');

function fail(message) {
  console.error(`Unable to update latest.yml: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(installerPath)) {
  fail(`${installerPath} does not exist. Run the Windows installer build first.`);
}

const installer = fs.readFileSync(installerPath);
const sha512 = crypto.createHash('sha512').update(installer).digest('base64');
const stats = fs.statSync(installerPath);
const releaseDate = new Date().toISOString();

const yaml = [
  `version: ${packageJson.version}`,
  'files:',
  `  - url: ${installerName}`,
  `    sha512: ${sha512}`,
  `    size: ${stats.size}`,
  `path: ${installerName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  ''
].join('\n');

fs.writeFileSync(latestPath, yaml, 'utf8');
console.log(`Updated ${latestPath} for Shield ${packageJson.version}.`);
