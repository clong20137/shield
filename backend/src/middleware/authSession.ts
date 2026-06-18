import { NextFunction, Request, Response } from 'express';
import { AuthAccountModel } from '../models/AuthAccount';
import { AuthSessionModel } from '../models/AuthSession';

export const AUTH_SESSION_COOKIE_NAME = 'shield_session';

function getCookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName));

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(encodedName.length));
  } catch {
    return null;
  }
}

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

export function getSessionToken(req: Request): string | null {
  const bearerToken = getBearerToken(req);
  if (bearerToken) {
    return bearerToken;
  }

  const cookieToken = getCookieValue(req, AUTH_SESSION_COOKIE_NAME);
  if (!cookieToken || !isWellFormedSessionToken(cookieToken)) {
    return null;
  }

  return cookieToken;
}

export function isWellFormedSessionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,160}$/u.test(token);
}

export async function getSessionAccount(req: Request) {
  const token = getSessionToken(req);

  if (!token) {
    return null;
  }

  return AuthSessionModel.getAccountForToken(token);
}

function isSafeReadRequest(req: Request): boolean {
  return req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
}

export function requireAuthenticated() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await getSessionAccount(req);

      if (!account) {
        return res.status(401).json({ error: 'Sign in required' });
      }

      if (account.mustChangePassword && !isSafeReadRequest(req)) {
        return res.status(403).json({ error: 'Password change required before continuing', mustChangePassword: true });
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
