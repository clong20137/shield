import { NextFunction, Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!isWellFormedSessionToken(token)) {
    return null;
  }

  return token;
}

export function isWellFormedSessionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,160}$/u.test(token);
}

export async function getSessionAccount(req: Request) {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  return AuthSessionModel.getAccountForToken(token);
}

export function requireAuthenticated() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      void AuthAccountModel.updateLastSeen(account.id).catch((error) => {
        console.error('Failed to update last seen:', error);
      });

      return next();
    } catch (error) {
      console.error('Authentication check error:', error);
      return res.status(500).json({ error: 'Failed to verify session' });
    }
  };
}
