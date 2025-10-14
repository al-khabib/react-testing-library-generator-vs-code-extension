import { ErrorRequestHandler } from 'express';
import { ApiErrorResponse, ServiceError } from '../types';
import { logger } from '../utils/logger';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const correlationId = res.locals.correlationId ?? req.correlationId;

  const serviceError =
    err instanceof ServiceError
      ? err
      : new ServiceError(
          err instanceof Error ? err.message : 'Internal Server Error',
          500,
          'internal_error',
          correlationId
        );

  const response: ApiErrorResponse = {
    success: false,
    error: {
      message: serviceError.message,
      code: serviceError.code,
      correlationId,
      details: serviceError.details
    }
  };

  logger.error(`Request failed [${req.method} ${req.originalUrl}]`, {
    correlationId,
    statusCode: serviceError.statusCode,
    code: serviceError.code,
    error: err instanceof Error ? err.stack : err
  });

  res.status(serviceError.statusCode).json(response);
};
