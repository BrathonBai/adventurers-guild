import { Request, Response, NextFunction } from 'express';
import { HttpError } from './errors';

const buckets = new Map<string, { count: number; resetAt: number }>();
const agentActionBuckets = new Map<string, { count: number; resetAt: number }>();

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'");
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function rateLimit(maxRequests = 120, windowMs = 60_000) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      next(new HttpError(429, 'RATE_LIMITED', 'Too many requests'));
      return;
    }
    next();
  };
}

export function agentActionRateLimit(maxActionsPerHour = 10) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = req.principal?.did || req.headers['x-api-key']?.toString() || req.ip || 'unknown';
    const now = Date.now();
    const bucket = agentActionBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      agentActionBuckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > maxActionsPerHour) {
      next(new HttpError(429, 'AGENT_RATE_LIMIT', `Agent action rate limit exceeded: ${maxActionsPerHour} per hour`));
      return;
    }

    next();
  };
}
