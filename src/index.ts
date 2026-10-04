import { serve } from '@hono/node-server';
import { app } from './app.js';
import { env } from './env.js';
import { logger } from './lib/logger.js';
import { prisma } from './db/client.js';
import { runScan } from './domain/scanner.js';
import { startAlertWorker, stopAlertWorker } from './jobs/alertWorker.js';
import { CONSTANTS } from './config/constants.js';

async function bootstrap() {
  logger.info({ nodeEnv: env.NODE_ENV, port: env.PORT }, 'Starting OrbitPing service...');

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info({ port: info.port, appUrl: env.APP_URL }, 'OrbitPing server listening');
    },
  );

  // Start background scanner loop
  runScan().catch((err) => logger.error({ err }, 'Initial scanner run failed'));
  const scannerInterval = setInterval(() => {
    runScan().catch((err) => logger.error({ err }, 'Scanner iteration failed'));
  }, CONSTANTS.SCANNER_INTERVAL_SECONDS * 1000);

  // Start background alert worker loop
  startAlertWorker().catch((err) => logger.error({ err }, 'Alert worker crashed'));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated...');
    clearInterval(scannerInterval);
    await stopAlertWorker();
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Database disconnected and HTTP server terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.fatal(error, 'Fatal error during server startup');
  process.exit(1);
});
