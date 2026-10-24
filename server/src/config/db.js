import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  // Тихий режим для скриптов: PRISMA_LOG_LEVEL=quiet node scripts/...
  log: process.env.PRISMA_LOG_LEVEL === 'quiet' ? ['error'] : (process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']),
});