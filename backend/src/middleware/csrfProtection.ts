import { NextFunction, Request, Response } from 'express';
import { isAllowedOrigin } from '../utils/originPolicy';

interface CsrfProtectionOptions {
  allowedOrigins: string[];
}

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrfProtection({ allowedOrigins }: CsrfProtectionOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!unsafeMethods.has(req.method)) {
      return next();
    }

    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');

    if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Origin not allowed' });
    }

    if ((site === 'cross-site' || site === 'same-site') && origin && !isAllowedOrigin(origin, allowedOrigins)) {
      return res.status(403).json({ error: 'Cross-site request blocked' });
    }

    return next();
  };
}
