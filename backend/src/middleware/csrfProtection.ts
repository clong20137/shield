import { NextFunction, Request, Response } from 'express';
import { getBearerToken } from './authSession';

interface CsrfProtectionOptions {
  allowedOrigins: string[];
}

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production' && isLocalDevelopmentOrigin(origin);
}

export function csrfProtection({ allowedOrigins }: CsrfProtectionOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!unsafeMethods.has(req.method)) {
      return next();
    }

    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');
    const hasCookie = Boolean(req.get('cookie'));
    const hasBearerToken = Boolean(getBearerToken(req));

    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    if ((site === 'cross-site' || site === 'same-site') && origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }

    if (hasCookie && !hasBearerToken) {
      return res.status(403).json({ error: 'Bearer token required for credentialed requests' });
    }

    return next();
  };
}
