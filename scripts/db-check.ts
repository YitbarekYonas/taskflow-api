import { prisma } from "../src/db.js";

async function expectFailure(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`UNEXPECTED SUCCESS  ${name}`);
  } catch (err) {
    console.log(`blocked as expected  ${name}  (code ${(err as { code?: string }).code})`);
  }
}

// Start from a clean slate so the script can be re-run
await prisma.comment.deleteMany();
await prisma.task.deleteMany();
await prisma.projectMember.deleteMany();
await prisma.project.deleteMany();
await prisma.user.deleteMany();

const sam = await prisma.user.create({ data: { email: "sam@example.com", name: "Sam",passwordHash: "!" } });
const project = await prisma.project.create({
  data: {
    name: "TaskFlow API",
    members: { create: { userId: sam.id, role: "owner" } }, // nested write: one call, two tables
  },
});
const task = await prisma.task.create({
  data: {
    title: "Design schema",
    priority: "high",
    dueDate: new Date("2026-11-01"),
    projectId: project.id,
    assigneeId: sam.id,
    comments: { create: [{ author: "Sam", body: "Started" }] },
  },
});

// One typed query that loads the whole tree
const loaded = await prisma.project.findUniqueOrThrow({
  where: { id: project.id },
  include: { members: { include: { user: true } }, tasks: { include: { comments: true } } },
});
console.log(JSON.stringify(loaded, null, 2));

// The rules the database enforces for you
await expectFailure("duplicate email (unique)", () =>
  prisma.user.create({ data: { email: "sam@example.com", name: "Clone",passwordHash: "!" } })
);
await expectFailure("task in missing project (foreign key)", () =>
  prisma.task.create({ data: { title: "Ghost", projectId: 99999 } })
);
await expectFailure("delete project that has tasks (restrict)", () =>
  prisma.project.delete({ where: { id: project.id } })
);

// Cascade and SetNull
await prisma.user.delete({ where: { id: sam.id } });
console.log("task assignee after user delete:", (await prisma.task.findUnique({ where: { id: task.id } }))?.assigneeId); // null
await prisma.task.delete({ where: { id: task.id } });
console.log("comments left after task delete:", await prisma.comment.count()); // 0
await prisma.project.delete({ where: { id: project.id } });
console.log("project deleted once it had no tasks");

await prisma.$disconnect();