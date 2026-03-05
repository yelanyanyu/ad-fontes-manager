import type { NextFunction, Request, Response } from 'express';

const { StatusCodes, ReasonPhrases } = require('http-status-codes') as {
  StatusCodes: {
    INTERNAL_SERVER_ERROR: number;
    UNPROCESSABLE_ENTITY: number;
    UNAUTHORIZED: number;
    SERVICE_UNAVAILABLE: number;
    NOT_FOUND: number;
  };
  ReasonPhrases: {
    INTERNAL_SERVER_ERROR: string;
  };
};

const { AppError } = require('../utils/errors') as {
  AppError: new (statusCode: number, message: string, data?: unknown) => {
    statusCode: number;
    message: string;
    data?: unknown;
  };
};

interface ErrorLike {
  statusCode?: number;
  message?: string;
  data?: unknown;
  name?: string;
  code?: string;
  stack?: string;
}

const isDev = process.env.NODE_ENV !== 'production';

const errorHandler = (err: ErrorLike, req: Request, res: Response, _next: NextFunction): void => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || ReasonPhrases.INTERNAL_SERVER_ERROR;
  let data: unknown = err.data ?? null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    data = err.data;
  }

  if (err.name === 'ValidationError') {
    statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
    message = message || 'Validation Error';
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    message = message || 'Unauthorized';
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    statusCode = StatusCodes.SERVICE_UNAVAILABLE;
    message = 'Database connection failed';
  }

  if (message === 'Not found') {
    statusCode = StatusCodes.NOT_FOUND;
  }

  const response: Record<string, unknown> = {
    success: false,
    code: statusCode,
    message,
  };

  if (data) {
    response.data = data;
  }

  if (isDev && statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

const notFoundHandler = (req: Request, res: Response): void => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    code: StatusCodes.NOT_FOUND,
    message: `Route ${req.originalUrl} not found`,
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
