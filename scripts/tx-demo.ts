import { prisma } from "../src/db.js";

const PREFIX = "tx-demo";

async function seedSource() {
  return prisma.project.create({
    data: {
      name: `${PREFIX} source`,
      tasks: { create: [1, 2, 3].map((i) => ({ title: `${PREFIX} task ${i}` })) },
    },
  });
}

async function copyWithoutTransaction(sourceId: number) {
  const tasks = await prisma.task.findMany({ where: { projectId: sourceId }, orderBy: { id: "asc" } });
  const copy = await prisma.project.create({ data: { name: `${PREFIX} copy (no transaction)` } });
  for (const [i, t] of tasks.entries()) {
    if (i === 1) throw new Error("simulated crash while copying");
    await prisma.task.create({ data: { title: `${t.title} (copy)`, projectId: copy.id } });
  }
}

async function copyWithTransaction(sourceId: number) {
  await prisma.$transaction(async (tx) => {
    const tasks = await tx.task.findMany({ where: { projectId: sourceId }, orderBy: { id: "asc" } });
    const copy = await tx.project.create({ data: { name: `${PREFIX} copy (transaction)` } });
    for (const [i, t] of tasks.entries()) {
      if (i === 1) throw new Error("simulated crash while copying");
      await tx.task.create({ data: { title: `${t.title} (copy)`, projectId: copy.id } });
    }
  });
}

async function report(label: string) {
  const rows = await prisma.project.findMany({
    where: { name: { startsWith: PREFIX } },
    include: { _count: { select: { tasks: true } } },
    orderBy: { id: "asc" },
  });
  console.log(`\n${label}`);
  for (const p of rows) console.log(`  project "${p.name}" has ${p._count.tasks} task(s)`);
}

try {
  const source = await seedSource();

  await copyWithoutTransaction(source.id).catch((e) => console.log(`Failed: ${e.message}`));
  await report("After the crash WITHOUT a transaction:");

  await copyWithTransaction(source.id).catch((e) => console.log(`Failed: ${e.message}`));
  await report("After the crash WITH a transaction:");
} finally {
  await prisma.task.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.project.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.$disconnect();
}