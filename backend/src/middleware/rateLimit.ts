import { NextFunction, Request, Response } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
}

const buckets = new Map<string, RateLimitRecord>();

function getClientKey(req: Request, keyPrefix: string): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];
  return `${keyPrefix}:${forwardedIp || req.ip || req.socket.remoteAddress || 'unknown'}`;
}

export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = getClientKey(req, options.keyPrefix);
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    existing.count += 1;
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
