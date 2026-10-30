const base = process.env.BASE_URL ?? "http://localhost:3000";

const cases: Array<[string, string]> = [
  ["first page", "/tasks?limit=10"],
  ["status + priority", "/tasks?status=todo&priority=high&limit=10"],
  ["search", `/tasks?search=${encodeURIComponent("bench task 4242")}&limit=10`],
  ["sort by dueDate", "/tasks?sort=dueDate&limit=10"],
  ["deep page", "/tasks?page=4999&limit=10"],
];

const loginRes = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.BENCH_EMAIL ?? "sam@example.com",
    password: process.env.BENCH_PASSWORD ?? "dev-password-123",
  }),
});
if (!loginRes.ok) throw new Error(`login failed with ${loginRes.status}; run npm run db:fresh first`);
const authHeaders = { Authorization: `Bearer ${(await loginRes.json()).data.accessToken}` };

async function time(path: string): Promise<number> {
  const start = performance.now();
  const res = await fetch(base + path, { headers: authHeaders });
  await res.arrayBuffer();
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return performance.now() - start;
}

console.log("case".padEnd(22), "median".padStart(10), "max".padStart(10));
for (const [name, path] of cases) {
  await time(path); // warm-up request, not counted
  const runs: number[] = [];
  for (let i = 0; i < 15; i++) runs.push(await time(path));
  runs.sort((a, b) => a - b);
  const fmt = (ms: number) => `${ms.toFixed(1)} ms`.padStart(10);
  console.log(name.padEnd(22), fmt(runs[7]), fmt(runs[14]));
}