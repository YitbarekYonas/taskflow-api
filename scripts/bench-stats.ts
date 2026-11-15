import { statsService } from "../src/container.js";
import { prisma } from "../src/db.js";
import { closeRedis, connectRedis } from "../src/redis.js";

const base = process.env.BASE_URL ?? "http://localhost:3000";

const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "sam@example.com", password: "dev-password-123" }),
});
if (!login.ok) throw new Error("login failed: run npm run db:fresh first");
const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken as string}` };

const projects = (await (await fetch(`${base}/projects`, { headers })).json()).data as Array<{
  id: number;
  name: string;
}>;
const target = projects.find((p) => p.name.startsWith("Bench project"));
if (!target) throw new Error("no benchmark project: run npm run db:bench-seed first");

async function timed() {
  const start = performance.now();
  const res = await fetch(`${base}/projects/${target!.id}/stats`, { headers });
  await res.arrayBuffer();
  return { ms: performance.now() - start, cache: res.headers.get("x-cache") };
}

await connectRedis();
const cold: number[] = [];
const warm: number[] = [];
for (let i = 0; i < 15; i++) {
  await statsService.invalidateProject(target.id); // the next request has to compute
  const a = await timed();
  const b = await timed();
  if (a.cache !== "miss" || b.cache !== "hit")
    throw new Error(`unexpected cache states: ${a.cache} then ${b.cache}`);
  cold.push(a.ms);
  warm.push(b.ms);
}
const median = (values: number[]) =>
  [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];
console.log(
  `project ${target.id}: cold (computed) ${median(cold).toFixed(1)} ms, warm (cached) ${median(warm).toFixed(1)} ms`,
);

await closeRedis();
await prisma.$disconnect();
