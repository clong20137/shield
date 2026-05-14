import { Request } from 'express';
import { AuthSessionModel } from '../models/AuthSession';

export function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
}

export async function getSessionAccount(req: Request) {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  return AuthSessionModel.getAccountForToken(token);
}
