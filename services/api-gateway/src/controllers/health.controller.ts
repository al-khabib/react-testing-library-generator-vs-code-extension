import { Request, Response } from 'express';
import { config } from '../utils/config';

export const getHealth = (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: config.serviceName,
    timestamp: new Date().toISOString()
  });
};
