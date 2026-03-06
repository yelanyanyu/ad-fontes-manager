import type { NextFunction, Request, Response } from 'express';

const config = require('../utils/config.ts') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
};

const { Unauthorized, Forbidden, ServiceUnavailable } = require('../utils/errors.ts') as {
  Unauthorized: (message?: string, data?: unknown) => Error;
  Forbidden: (message?: string, data?: unknown) => Error;
  ServiceUnavailable: (message?: string, data?: unknown) => Error;
};

const { loggers } = require('../utils/logger.ts') as {
  loggers: {
    auth: {
      warn: (payload: Record<string, unknown>, message: string) => void;
      error: (payload: Record<string, unknown>, message: string) => void;
    };
  };
};

const normalizeHeaderToken = (headerValue: unknown): string => {
  if (Array.isArray(headerValue)) {
    return String(headerValue[0] || '').trim();
  }
  return String(headerValue || '').trim();
};

const getConfiguredAdminToken = (): string =>
  String(config.get<string>('core.admin_token', process.env.ADMIN_TOKEN || '') || '').trim();

const buildLogContext = (req: Request): Record<string, unknown> => ({
  requestId: (req as Request & { id?: string }).id,
  route: req.originalUrl || req.url,
  method: req.method,
  userId: req.headers['x-user-id'],
  ip: req.ip,
});

const requireWriteAccess = (req: Request, _res: Response, next: NextFunction): void => {
  const adminToken = getConfiguredAdminToken();
  const requestToken = normalizeHeaderToken(req.headers['x-admin-token']);
  const isProduction = process.env.NODE_ENV === 'production';
  const context = buildLogContext(req);

  if (!adminToken) {
    loggers.auth.error(context, '[Security] write access rejected: admin token not configured');
    throw ServiceUnavailable('Service unavailable: admin authentication not configured');
  }

  if (!requestToken) {
    loggers.auth.warn(context, '[Security] write access rejected: missing admin token');
    throw Unauthorized('Unauthorized: missing admin token');
  }

  if (requestToken !== adminToken) {
    loggers.auth.warn(context, '[Security] write access rejected: invalid admin token');
    throw Forbidden(
      isProduction
        ? 'Forbidden: insufficient permissions'
        : 'Forbidden: invalid admin token for write access'
    );
  }

  next();
};

module.exports = {
  requireWriteAccess,
};
