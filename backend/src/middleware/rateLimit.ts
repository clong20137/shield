import { NextFunction, Request, Response } from 'express';
import { createHash } from 'crypto';
import { getSessionToken } from './authSession';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  keyBy?: 'sessionOrClient' | 'client';
  skipPaths?: string[];
}

const buckets = new Map<string, RateLimitRecord>();

function getClientKey(req: Request, keyPrefix: string, keyBy: RateLimitOptions['keyBy'] = 'sessionOrClient'): string {
  if (keyBy === 'sessionOrClient') {
    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      const tokenHash = createHash('sha256').update(sessionToken).digest('hex').slice(0, 24);
      return `${keyPrefix}:session:${tokenHash}`;
    }
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];
  const trustedProxyEnabled = process.env.TRUST_PROXY === 'true';
  return `${keyPrefix}:client:${trustedProxyEnabled ? forwardedIp || req.ip || req.socket.remoteAddress || 'unknown' : req.ip || req.socket.remoteAddress || 'unknown'}`;
}

export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skipPaths?.some((path) => req.path === path || req.path.startsWith(`${path}/`))) {
      return next();
    }

    const now = Date.now();
    const key = getClientKey(req, options.keyPrefix, options.keyBy);
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - 1)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + options.windowMs) / 1000)));
      return next();
    }

    existing.count += 1;
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - existing.count)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
    if (existing.count > options.max) {
      const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: options.message });
    }

    return next();
  };
}

export function cleanupRateLimitBuckets() {
  const now = Date.now();
  buckets.forEach((record, key) => {
    if (record.resetAt <= now) {
      buckets.delete(key);
    }
  });
}
