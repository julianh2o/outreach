import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { config } from './config';

// Create Prisma adapter with database URL
const adapter = new PrismaLibSql({
  url: config.database.url,
});

// Singleton pattern to prevent multiple instances
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });

if (!config.isProduction) {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
