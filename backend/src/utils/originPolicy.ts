export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/u, '');
}

export function parseAllowedOrigins(value = ''): string[] {
  return value
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  if (process.env.NODE_ENV !== 'production' && isLocalDevelopmentOrigin(normalizedOrigin)) {
    return true;
  }

  return allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production';
}
