import { execFileSync } from "node:child_process";
import pg from "pg";
import { TEST_DATABASE_URL } from "./env.js";

export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);

  // Layer 1 of the safety net: only ever touch databases named *_test
  if (!/^[a-z0-9_]+_test$/.test(dbName)) {
    throw new Error(`Refusing to run tests: database "${dbName}" must match [a-z0-9_]+_test`);
  }

  // Connect to the maintenance database to create the test database if it does not exist yet
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch (error) {
  throw new Error("Cannot reach PostgreSQL. Is it running? Try: npm run db:up", { cause: error });
}
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`); // name validated above
  } finally {
    await client.end();
  }

  // Apply every migration. This also proves the migrations work from an empty database.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
