import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

const { BadRequest } = require('../utils/errors.ts') as {
  BadRequest: (message: string, data?: unknown) => Error;
};

const parseOrThrow = (schema: ZodType<unknown>, payload: unknown): unknown => {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  const flattened = result.error.flatten();
  const issueMessages = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  const message = issueMessages.length > 0 ? issueMessages.join('; ') : 'Validation failed';

  throw BadRequest(message, {
    code: 'VALIDATION_ERROR',
    details: flattened,
  });
};

const setRequestField = <K extends 'body' | 'query' | 'params'>(
  req: Request,
  key: K,
  value: Request[K]
): void => {
  try {
    Object.defineProperty(req, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } catch {
    const current = (req as Request & Record<string, unknown>)[key];

    if (
      current &&
      typeof current === 'object' &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(current) &&
      !Array.isArray(value)
    ) {
      for (const existingKey of Object.keys(current as Record<string, unknown>)) {
        delete (current as Record<string, unknown>)[existingKey];
      }

      Object.assign(current as Record<string, unknown>, value as Record<string, unknown>);
      return;
    }

    throw new TypeError(`Unable to write validated request.${key}`);
  }
};

const validateBody = (schema: ZodType<unknown>) =>
  function validateBodyMiddleware(req: Request, _res: Response, next: NextFunction): void {
    setRequestField(req, 'body', parseOrThrow(schema, req.body) as Request['body']);
    next();
  };

const validateQuery = (schema: ZodType<unknown>) =>
  function validateQueryMiddleware(req: Request, res: Response, next: NextFunction): void {
    const validatedQuery = parseOrThrow(schema, req.query) as Record<string, unknown>;

    try {
      Object.defineProperty(req, 'validatedQuery', {
        value: validatedQuery,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // Keep runtime stable even when request object disallows extension.
    }

    res.locals.validatedQuery = validatedQuery;

    next();
  };

const validateParams = (schema: ZodType<unknown>) =>
  function validateParamsMiddleware(req: Request, _res: Response, next: NextFunction): void {
    setRequestField(req, 'params', parseOrThrow(schema, req.params) as Request['params']);
    next();
  };

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
