const fs = require('fs');
const path = require('path');

const requiredUpdateUrl = (process.env.SHIELD_UPDATE_URL || '').trim();
const configPath = path.join(__dirname, '..', 'config.json');

function fail(message) {
  console.error(`Desktop production build blocked: ${message}`);
  process.exit(1);
}

function assertProductionUrl(label, value) {
  if (!value) {
    fail(`${label} is required.`);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be a valid HTTPS URL.`);
  }

  if (parsed.protocol !== 'https:') {
    fail(`${label} must use HTTPS.`);
  }

  if (parsed.hostname === 'shield.example.gov' || parsed.hostname.endsWith('.example.gov')) {
    fail(`${label} still points at the example domain.`);
  }
}

assertProductionUrl('SHIELD_UPDATE_URL', requiredUpdateUrl);

if (!fs.existsSync(configPath)) {
  fail('desktop/config.json is required for production builds.');
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
assertProductionUrl('config.json appUrl', config.appUrl);
assertProductionUrl('config.json updateUrl', config.updateUrl);

if (config.updateUrl !== requiredUpdateUrl) {
  fail('SHIELD_UPDATE_URL must match config.json updateUrl so installer metadata and runtime updater agree.');
}

if (!process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  fail('code signing is required. Set CSC_LINK or WIN_CSC_LINK for the Windows signing certificate.');
}
