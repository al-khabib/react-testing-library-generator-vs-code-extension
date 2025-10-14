import { Application } from 'express';
import validationRoutes from './validation.routes';

export const registerRoutes = (app: Application): void => {
  app.use('/api', validationRoutes);
};
