import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: !isProduction ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  base: { service: 'arena-server' },
  serializers: pino.stdSerializers,
});

export function childLogger(module: string) {
  return logger.child({ module });
}
