import { prisma } from "../../src/db.js";

// Empties every table (except Prisma's own history) and restarts the id counters.
export async function truncateAll() {
  // Layer 2 of the safety net: check the database we are REALLY connected to
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith("_test")) {
    throw new Error(`Refusing to truncate "${db}": not a test database`);
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}