import { Redis } from "ioredis";
import { TEST_REDIS_URL } from "./env.js";

// Same idea as the *_test database rule: tests may only touch Redis database 15
export function assertTestRedis(url: string = TEST_REDIS_URL): void {
  if (new URL(url).pathname !== "/15") {
    throw new Error(`Refusing to use Redis at ${url}: tests must use database /15`);
  }
}

export async function flushTestRedis(): Promise<void> {
  assertTestRedis();
  const client = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await client.flushdb(); // flushes only the selected database (15)
  } finally {
    client.disconnect();
  }
}
