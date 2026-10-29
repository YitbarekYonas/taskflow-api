const base = process.env.BASE_URL ?? "http://localhost:3000";

async function time(email: string) {
  const start = performance.now();
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password-123" }),
  });
  await res.arrayBuffer();
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return performance.now() - start;
}

async function median(email: string) {
  await time(email); // warm-up, not counted
  const runs: number[] = [];
  for (let i = 0; i < 15; i++) runs.push(await time(email));
  runs.sort((a, b) => a - b);
  return runs[7];
}

console.log(`existing email, wrong password: ${(await median("sam@example.com")).toFixed(1)} ms`);
console.log(`unknown email:                  ${(await median("nobody@example.com")).toFixed(1)} ms`);