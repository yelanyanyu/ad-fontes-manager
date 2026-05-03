const createError = require('http-errors') as typeof import('http-errors');
const { StatusCodes, ReasonPhrases } =
  require('http-status-codes') as typeof import('http-status-codes');

class AppError extends Error {
  statusCode: number;
  data: unknown;
  isOperational: boolean;

  constructor(statusCode: number, message: string, data: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorTypes = {
  BadRequest: (message = ReasonPhrases.BAD_REQUEST, data: unknown = null) =>
    new AppError(StatusCodes.BAD_REQUEST, message, data),
  Unauthorized: (message = ReasonPhrases.UNAUTHORIZED, data: unknown = null) =>
    new AppError(StatusCodes.UNAUTHORIZED, message, data),
  Forbidden: (message = ReasonPhrases.FORBIDDEN, data: unknown = null) =>
    new AppError(StatusCodes.FORBIDDEN, message, data),
  NotFound: (message = ReasonPhrases.NOT_FOUND, data: unknown = null) =>
    new AppError(StatusCodes.NOT_FOUND, message, data),
  Conflict: (message = ReasonPhrases.CONFLICT, data: unknown = null) =>
    new AppError(StatusCodes.CONFLICT, message, data),
  UnprocessableEntity: (message = ReasonPhrases.UNPROCESSABLE_ENTITY, data: unknown = null) =>
    new AppError(StatusCodes.UNPROCESSABLE_ENTITY, message, data),
  TooManyRequests: (message = ReasonPhrases.TOO_MANY_REQUESTS, data: unknown = null) =>
    new AppError(StatusCodes.TOO_MANY_REQUESTS, message, data),
  InternalServerError: (message = ReasonPhrases.INTERNAL_SERVER_ERROR, data: unknown = null) =>
    new AppError(StatusCodes.INTERNAL_SERVER_ERROR, message, data),
  ServiceUnavailable: (message = ReasonPhrases.SERVICE_UNAVAILABLE, data: unknown = null) =>
    new AppError(StatusCodes.SERVICE_UNAVAILABLE, message, data),
};

type AsyncHandlerFn = (
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void
) => Promise<unknown> | unknown;

const asyncHandler =
  (fn: AsyncHandlerFn) =>
  (req: unknown, res: unknown, next: (err?: unknown) => void): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

module.exports = {
  AppError,
  ...errorTypes,
  asyncHandler,
  createError,
  StatusCodes,
  ReasonPhrases,
};
