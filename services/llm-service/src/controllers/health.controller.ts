import { NextFunction, Request, Response } from 'express';
import { config } from '../utils/config';
import { ollamaClient } from '../services/ollamaClient';
import { ServiceError } from '../types';

export const getHealth = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const healthy = await ollamaClient.checkHealth();
    res.json({
      success: true,
      data: {
        status: healthy ? 'ok' : 'degraded',
        service: config.serviceName,
        model: config.ollama.modelName,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    next(
      error instanceof ServiceError
        ? error
        : ServiceError.unavailable('Ollama health check failed.', error)
    );
  }
};
