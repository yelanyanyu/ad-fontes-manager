const { StatusCodes, ReasonPhrases } = require('http-status-codes');
const { AppError } = require('../utils/errors');

const isDev = process.env.NODE_ENV !== 'production';

const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let message = err.message || ReasonPhrases.INTERNAL_SERVER_ERROR;
  let data = err.data || null;

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

  // Handle legacy service errors (backward compatibility)
  if (message === 'Not found') {
    statusCode = StatusCodes.NOT_FOUND;
  }

  const response = {
    success: false,
    code: statusCode,
    message: message,
  };

  if (data) {
    response.data = data;
  }

  if (isDev && statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

const notFoundHandler = (req, res) => {
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
