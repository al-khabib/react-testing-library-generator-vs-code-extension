import { config } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogMeta {
  correlationId?: string;
  [key: string]: unknown;
}

const formatMessage = (level: LogLevel, message: string, correlationId?: string): string => {
  const timestamp = new Date().toISOString();
  const correlationSegment = correlationId ? ` [cid=${correlationId}]` : '';
  return `[${timestamp}] [${config.serviceName}] ${level.toUpperCase()}:${correlationSegment} ${message}`;
};

const log = (level: LogLevel, message: string, meta?: LogMeta) => {
  const correlationId = meta?.correlationId;
  const output = formatMessage(level, message, correlationId);
  const consoleFn = (console[level] as ((...args: unknown[]) => void) | undefined) ?? console.log;

  if (meta && Object.keys(meta).length > 0) {
    consoleFn.call(console, output, meta);
  } else {
    consoleFn.call(console, output);
  }
};

export const logger = {
  info: (message: string, meta?: LogMeta) => log('info', message, meta),
  warn: (message: string, meta?: LogMeta) => log('warn', message, meta),
  error: (message: string, meta?: LogMeta) => log('error', message, meta),
  debug: (message: string, meta?: LogMeta) => log('debug', message, meta),
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
};
