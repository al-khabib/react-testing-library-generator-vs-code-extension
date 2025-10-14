import { Application } from 'express';
import analysisRoutes from './analysis.routes';

export const registerRoutes = (app: Application): void => {
  app.use('/api', analysisRoutes);
};
