import { prisma } from "../src/db.js";

let operations = 0;
const counted = prisma.$extends({
  query: {
    $allOperations({ args, query }) {
      operations++;
      return query(args);
    },
  },
});

try {
  await prisma.project.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({ name: `n+1 demo ${i}` })),
  });

  operations = 0;
  const projects = await counted.project.findMany();
  for (const p of projects) {
    await counted.task.count({ where: { projectId: p.id } });
  }
  console.log(`naive loop:   ${operations} operations for ${projects.length} projects`);

  operations = 0;
  await counted.project.findMany({ include: { _count: { select: { tasks: true } } } });
  console.log(`_count:       ${operations} operation`);
} finally {
  await prisma.project.deleteMany({ where: { name: { startsWith: "n+1 demo" } } });
  await prisma.$disconnect();
}