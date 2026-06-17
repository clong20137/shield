type SecurityFinding = {
  key: string;
  message: string;
};

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function hasExactAllowedOrigin() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .some((origin) => /^https:\/\//iu.test(origin) && !origin.includes('*'));
}

export function getProductionSecurityFindings(): SecurityFinding[] {
  if (!isProduction()) {
    return [];
  }

  const findings: SecurityFinding[] = [];
  const sessionCookieSecure = (process.env.SESSION_COOKIE_SECURE || '').trim().toLowerCase();
  const sessionCookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').trim().toLowerCase();
  const allowConsoleResetLinks = (process.env.ALLOW_CONSOLE_RESET_LINKS || 'false').trim().toLowerCase();
  const appBaseUrl = (process.env.APP_BASE_URL || '').trim();
  const apiBaseUrl = (process.env.API_BASE_URL || '').trim();
  const ssoStateSecret = (process.env.SSO_STATE_SECRET || '').trim();

  if (sessionCookieSecure !== 'true') {
    findings.push({
      key: 'SESSION_COOKIE_SECURE',
      message: 'SESSION_COOKIE_SECURE should be true in production so browser sessions only travel over HTTPS.',
    });
  }

  if (!['lax', 'strict'].includes(sessionCookieSameSite)) {
    findings.push({
      key: 'SESSION_COOKIE_SAMESITE',
      message: 'SESSION_COOKIE_SAMESITE should be lax or strict in production unless cross-site auth is explicitly required.',
    });
  }

  if (!hasExactAllowedOrigin()) {
    findings.push({
      key: 'ALLOWED_ORIGINS',
      message: 'ALLOWED_ORIGINS should include the exact HTTPS application origin in production.',
    });
  }

  if (appBaseUrl && !appBaseUrl.startsWith('https://')) {
    findings.push({
      key: 'APP_BASE_URL',
      message: 'APP_BASE_URL should use HTTPS in production.',
    });
  }

  if (apiBaseUrl && !apiBaseUrl.startsWith('https://')) {
    findings.push({
      key: 'API_BASE_URL',
      message: 'API_BASE_URL should use HTTPS in production.',
    });
  }

  if (allowConsoleResetLinks === 'true') {
    findings.push({
      key: 'ALLOW_CONSOLE_RESET_LINKS',
      message: 'ALLOW_CONSOLE_RESET_LINKS must be false in production to avoid exposing reset links in logs.',
    });
  }

  if (!ssoStateSecret || ssoStateSecret === 'replace_with_a_long_random_secret' || ssoStateSecret.length < 32) {
    findings.push({
      key: 'SSO_STATE_SECRET',
      message: 'SSO_STATE_SECRET should be a unique random secret of at least 32 characters.',
    });
  }

  return findings;
}

export function logProductionSecurityFindings() {
  const findings = getProductionSecurityFindings();
  if (findings.length === 0) {
    if (isProduction()) {
      console.info('Production security configuration checks passed.');
    }
    return;
  }

  console.warn('Production security configuration needs attention:');
  findings.forEach((finding) => {
    console.warn(`- ${finding.key}: ${finding.message}`);
  });
}

