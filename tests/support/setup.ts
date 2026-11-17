import { afterAll, beforeEach } from "vitest";
import { prisma } from "../../src/db.js";
import { truncateAll } from "./db.js";
import { flushTestRedis } from "./redis.js";

beforeEach(async () => {
  await truncateAll();
  await flushTestRedis(); // ids restart at 1 after a truncate, so cached answers for "project 1" would be wrong
});

afterAll(async () => {
  await prisma.$disconnect();
});
