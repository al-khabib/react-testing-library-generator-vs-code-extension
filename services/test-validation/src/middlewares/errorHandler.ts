import { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/appError';
import { logger } from '../utils/logger';

interface ErrorResponse {
  message: string;
  details?: unknown;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err instanceof AppError ? err.statusCode : 500;
  const response: ErrorResponse = {
    message: err instanceof AppError ? err.message : 'Internal Server Error'
  };

  if (err instanceof AppError && err.details) {
    response.details = err.details;
  }

  logger.error(`Request failed [${req.method} ${req.originalUrl}]`, err);

  res.status(status).json(response);
};
