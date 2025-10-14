import { Request, Response } from 'express';
import { config } from '../utils/config';

export const getHealth = (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: config.serviceName,
      timestamp: new Date().toISOString()
    }
  });
};
