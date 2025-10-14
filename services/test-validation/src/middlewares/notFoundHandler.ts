import { RequestHandler } from 'express';
import { AppError } from '../utils/appError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Resource not found: ${req.method} ${req.originalUrl}`));
};
