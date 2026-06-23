import { Request, Response, NextFunction } from 'express';
import { sha256Hmac, safeEqual, stableStringify } from './cryptoUtils';
import { GuildDatabase, StoredApiKey } from './GuildDatabase';
import { errorBody, HttpError } from './errors';

export type AuthRole = 'ANONYMOUS' | 'MEMBER' | 'AGENT' | 'ADMIN';

export type AuthPrincipal = {
  role: AuthRole;
  did?: string;
  subjectType?: 'MEMBER' | 'AGENT' | 'ADMIN';
  scopes: string[];
  apiKeyId?: string;
  token?: string;
};

declare global {
  namespace Express {
    interface Request {
      principal?: AuthPrincipal;
    }
  }
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function authSecret(): string {
  return process.env.AUTH_SECRET || process.env.SESSION_SECRET || 'dev-only-change-me';
}

export function issueSessionToken(payload: { sub: string; role: 'ADMIN' | 'MEMBER'; did?: string; scopes?: string[] }): string {
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${body}.${sha256Hmac(authSecret(), body)}`;
}

export function verifySessionToken(token: string): AuthPrincipal | undefined {
  const [body, signature] = token.split('.');
  if (!body || !signature || !safeEqual(signature, sha256Hmac(authSecret(), body))) {
    return undefined;
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { role: AuthRole; did?: string; scopes?: string[]; exp: number };
  if (payload.exp < Date.now()) {
    return undefined;
  }

  return { role: payload.role, did: payload.did, scopes: payload.scopes ?? [], token };
}

export function principalFromApiKey(record: StoredApiKey, token?: string): AuthPrincipal {
  return {
    role: record.role,
    did: record.subjectDid,
    subjectType: record.subjectType,
    scopes: record.scopes,
    apiKeyId: record.id,
    token,
  };
}

export function authMiddleware(db: GuildDatabase) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.get('authorization') || '';
    const apiKey = req.get('x-api-key');
    req.principal = { role: 'ANONYMOUS', scopes: [] };

    if (header.startsWith('Bearer ')) {
      const principal = verifySessionToken(header.slice('Bearer '.length));
      if (principal) {
        req.principal = principal;
      }
    } else if (apiKey) {
      const record = db.verifyApiKey(apiKey);
      if (record) {
        req.principal = principalFromApiKey(record, apiKey);
      }
    }

    next();
  };
}

export function requireRole(...roles: AuthRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.principal || !roles.includes(req.principal.role)) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required'));
      return;
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.principal?.role !== 'ADMIN') {
    next(new HttpError(403, 'ADMIN_REQUIRED', 'Admin RBAC denies this request'));
    return;
  }
  next();
}

export function loginWithPassword(username: string, password: string): string | undefined {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) {
    return undefined;
  }
  if (safeEqual(username, expectedUser) && safeEqual(password, expectedPassword)) {
    return issueSessionToken({ sub: username, role: 'ADMIN', scopes: ['ADMIN'] });
  }
  return undefined;
}

export function verifyDidSignature(secret: string, message: unknown, signature?: string): boolean {
  if (!signature) {
    return false;
  }
  return safeEqual(signature, sha256Hmac(secret, stableStringify(message)));
}

export function expressErrorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json(errorBody(error.code, error.message));
    return;
  }

  res.status(500).json(errorBody('INTERNAL_ERROR', error instanceof Error ? error.message : 'Internal server error'));
}
