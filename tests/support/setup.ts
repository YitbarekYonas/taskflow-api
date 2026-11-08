import { afterAll, beforeEach } from "vitest";
import { prisma } from "../../src/db.js";
import { truncateAll } from "./db.js";

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});