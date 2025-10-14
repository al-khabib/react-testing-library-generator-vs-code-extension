import { ErrorRequestHandler } from 'express';
import { ServiceError } from '../types';
import { logger } from '../utils/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const serviceError =
    err instanceof ServiceError
      ? err
      : new ServiceError(err instanceof Error ? err.message : 'Internal Server Error');

  logger.error(`Request failed [${req.method} ${req.originalUrl}]`, {
    code: serviceError.code,
    statusCode: serviceError.statusCode,
    details: serviceError.details,
    stack: err instanceof Error ? err.stack : err
  });

  res.status(serviceError.statusCode).json({
    success: false,
    error: {
      message: serviceError.message,
      code: serviceError.code,
      details: serviceError.details
    }
  });
};
