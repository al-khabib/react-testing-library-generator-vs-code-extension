import { Application } from 'express';
import generationRoutes from './generation.routes';

export const registerRoutes = (app: Application): void => {
  app.use('/api', generationRoutes);
};
