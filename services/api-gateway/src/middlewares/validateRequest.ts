import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';
import { ServiceError } from '../types';

export const validateRequest =
  (schema: AnyZodObject) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parseResult = schema.safeParse(req.body);

    if (!parseResult.success) {
      const issues = parseResult.error.flatten();
      next(ServiceError.validation('Invalid request payload.', issues, req.correlationId));
      return;
    }

    req.body = parseResult.data;
    next();
  };
