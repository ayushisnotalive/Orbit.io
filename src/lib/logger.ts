import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'HH:MM:ss Z',
        },
      }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'targetEnc'],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
