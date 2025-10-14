import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/errorHandler';
import { notFoundHandler } from './middlewares/notFoundHandler';
import { registerRoutes } from './routes';
import { config } from './utils/config';
import { logger } from './utils/logger';

dotenv.config();

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined', { stream: logger.stream }));

registerRoutes(app);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const startServer = (): void => {
  server.listen(config.port, () => {
    logger.info(`Service listening on port ${config.port}`);
  });

  server.on('error', (error) => {
    logger.error('Server encountered an unexpected error', error);
    process.exitCode = 1;
  });
};

const gracefulShutdown = (signal: NodeJS.Signals): void => {
  logger.warn(`Received ${signal}. Shutting down gracefully.`);
  server.close((error) => {
    if (error) {
      logger.error('Error while closing server', error);
      process.exit(1);
    }
    logger.info('Shutdown complete.');
    process.exit(0);
  });
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal as NodeJS.Signals, gracefulShutdown);
});

if (require.main === module) {
  startServer();
}

export { app, startServer };
