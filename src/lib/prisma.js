// Prisma singleton — prevents multiple PrismaClient instances in development.
// Uses globalThis to persist across Next.js hot reloads.

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__prisma = prisma;
}

export function getPrisma() {
    return prisma;
}

export default getPrisma;
