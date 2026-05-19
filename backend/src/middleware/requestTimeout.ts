import { NextFunction, Request, Response } from 'express';

interface RequestTimeoutOptions {
  timeoutMs: number;
  message: string;
  skipPaths?: string[];
}

export function requestTimeout(options: RequestTimeoutOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skipPaths?.some((path) => req.originalUrl.startsWith(path))) {
      return next();
    }

    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({ error: options.message });
      }

      req.destroy();
    }, options.timeoutMs);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => clearTimeout(timeout));

    req.setTimeout(options.timeoutMs);
    res.setTimeout(options.timeoutMs);

    return next();
  };
}
