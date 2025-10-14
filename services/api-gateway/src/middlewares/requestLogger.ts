import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = req.header('x-correlation-id')?.trim() || uuidv4();
  const startTime = Date.now();

  req.correlationId = correlationId;
  res.locals.correlationId = correlationId;
  res.locals.requestStartTime = startTime;
  res.setHeader('x-correlation-id', correlationId);

  logger.info(`Incoming request: ${req.method} ${req.originalUrl}`, { correlationId });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(
      `Completed request: ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`,
      {
        correlationId,
        duration
      }
    );
  });

  res.on('close', () => {
    if (!res.writableFinished) {
      const duration = Date.now() - startTime;
      logger.warn(`Request aborted: ${req.method} ${req.originalUrl}`, {
        correlationId,
        duration
      });
    }
  });

  next();
};
