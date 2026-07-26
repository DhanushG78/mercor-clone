import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { env } from "../env";

/**
 * Singleton Prisma Client with pg Driver Adapter (Prisma 7 compatible)
 * 
 * Flow:
 * Upper layers (Repository/Services) -> prisma (lazy Proxy instance) -> PrismaPg Adapter -> pg.Pool -> Supabase DB
 * 
 * Build Safety:
 * Using a Proxy delays instantiation of pg.Pool until a database query is actually invoked.
 * This prevents pg.Pool from opening active socket handles during `next build`, allowing Node.js
 * to exit cleanly immediately after static page generation completes.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString =
    env.DATABASE_URL ||
    "postgres://placeholder:placeholder@localhost:5432/placeholder";

  const pool = new pg.Pool({
    connectionString,
  });

  const adapter = new PrismaPg(pool);

  const client = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

let instanceCache: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (typeof window !== "undefined") {
    return null as unknown as PrismaClient;
  }
  if (!instanceCache) {
    instanceCache = createPrismaClient();
  }
  return instanceCache;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const instance = getPrisma();
    if (!instance) return undefined;
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type { PrismaClient } from "../../generated/prisma/client";

