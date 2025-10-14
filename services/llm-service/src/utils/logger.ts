import { config } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const formatMessage = (level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${config.serviceName}] ${level.toUpperCase()}: ${message}`;
};

const log = (level: LogLevel, message: string, meta?: unknown) => {
  const output = formatMessage(level, message);
  if (meta !== undefined) {
    console[level](output, meta);
  } else {
    console[level](output);
  }
};

export const logger = {
  info: (message: string, meta?: unknown) => log('info', message, meta),
  warn: (message: string, meta?: unknown) => log('warn', message, meta),
  error: (message: string, meta?: unknown) => log('error', message, meta),
  debug: (message: string, meta?: unknown) => log('debug', message, meta),
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
};
