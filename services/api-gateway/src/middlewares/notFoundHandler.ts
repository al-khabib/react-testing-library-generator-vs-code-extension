import { RequestHandler } from 'express';
import { ServiceError } from '../types';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new ServiceError(
      `Resource not found: ${req.method} ${req.originalUrl}`,
      404,
      'not_found',
      req.correlationId
    )
  );
};
