import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

const { BadRequest } = require('../utils/errors.ts') as {
  BadRequest: (message: string, data?: unknown) => Error;
};

const parseOrThrow = (schema: ZodTypeAny, payload: unknown): unknown => {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;

  throw BadRequest('Validation failed', {
    code: 'VALIDATION_ERROR',
    details: result.error.flatten(),
  });
};

const validateBody = (schema: ZodTypeAny) =>
  function validateBodyMiddleware(req: Request, _res: Response, next: NextFunction): void {
    req.body = parseOrThrow(schema, req.body) as Request['body'];
    next();
  };

const validateQuery = (schema: ZodTypeAny) =>
  function validateQueryMiddleware(req: Request, _res: Response, next: NextFunction): void {
    req.query = parseOrThrow(schema, req.query) as Request['query'];
    next();
  };

const validateParams = (schema: ZodTypeAny) =>
  function validateParamsMiddleware(req: Request, _res: Response, next: NextFunction): void {
    req.params = parseOrThrow(schema, req.params) as Request['params'];
    next();
  };

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
