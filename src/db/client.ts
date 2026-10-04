import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../lib/logger.js';

type PrismaClientWithEvents = PrismaClient<{
  log: [
    { emit: 'event'; level: 'query' },
    { emit: 'event'; level: 'error' },
    { emit: 'event'; level: 'warn' },
  ];
}>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientWithEvents | undefined;
};

export const prisma: PrismaClientWithEvents =
  globalForPrisma.prisma ??
  (new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  }) as PrismaClientWithEvents);

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: Prisma.QueryEvent) => {
    logger.trace({ query: e.query, durationMs: e.duration }, 'Prisma Query');
  });
}

prisma.$on('error', (e: Prisma.LogEvent) => {
  logger.error(e, 'Prisma Database Error');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

