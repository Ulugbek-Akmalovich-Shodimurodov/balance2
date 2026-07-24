import { PrismaClient } from '@prisma/client';

const globalDatabase = globalThis;
export const prisma = globalDatabase.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalDatabase.prisma = prisma;
}
