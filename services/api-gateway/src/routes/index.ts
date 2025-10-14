import { Application } from 'express';
import { rateLimiter } from '../middlewares/rateLimiter';
import testGeneratorRoutes from './test-generator';

export const registerRoutes = (app: Application): void => {
  app.use('/api', rateLimiter, testGeneratorRoutes);
};
