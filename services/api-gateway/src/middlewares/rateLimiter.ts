import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../utils/config';
import { ServiceError } from '../types';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response, next: NextFunction) => {
    const error = new ServiceError(
      'Too many requests. Please try again later.',
      429,
      'rate_limited',
      req.correlationId
    );
    next(error);
  }
});
