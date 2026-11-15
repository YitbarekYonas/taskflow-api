import type { Express } from "express";
import { vi } from "vitest";

// Loads a fresh copy of the application under the given environment values.
export async function buildApp(env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const { createApp } = await import("../../src/app.js");
  const { prisma } = await import("../../src/db.js");
  const redisModule = await import("../../src/redis.js");
  const connected = await redisModule.connectRedis();

  return {
    app: createApp() as Express,
    connected,
    stop: async () => {
      await redisModule.closeRedis();
      await prisma.$disconnect();
    },
  };
}
