import { prisma } from "../src/db.js";

const TOTAL = 50_000;
const CHUNK = 2_000;
const STATUSES = ["todo", "in_progress", "done"] as const;
const PRIORITIES = ["low", "medium", "high"] as const;
const DAY = 86_400_000;

try {
  // always remove old benchmark data first (tasks before projects: the FK restricts it)
  await prisma.task.deleteMany({ where: { title: { startsWith: "Bench task" } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: "Bench project" } } });
  if (process.argv.includes("--clean")) {
    console.log("Benchmark data removed");
  } else {
    await prisma.project.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ name: `Bench project ${i + 1}` })),
    });
    const projects = await prisma.project.findMany({
      where: { name: { startsWith: "Bench project" } },
      orderBy: { id: "asc" },
    });

    for (let start = 0; start < TOTAL; start += CHUNK) {
      const data = Array.from({ length: CHUNK }, (_, k) => {
        const i = start + k;
        const r = (i * 7919) % 1000; // cheap deterministic "randomness"
        return {
          title: `Bench task ${i}`,
          // skewed on purpose: most tasks are done, like in a real system
          status: r < 600 ? STATUSES[2] : r < 800 ? STATUSES[1] : STATUSES[0],
          priority: PRIORITIES[i % 3],
          dueDate: r % 5 === 0 ? null : new Date(Date.UTC(2026, 0, 1) + (r % 700) * DAY),
          createdAt: new Date(Date.UTC(2026, 0, 1) + i * 600_000),
          projectId: projects[i % projects.length].id,
        };
      });
      await prisma.task.createMany({ data });
    }
    console.log(`Seeded ${TOTAL} tasks in 5 projects`);
  }
} finally {
  await prisma.$disconnect();
}