import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed fake users in production.");
  process.exit(1);
}

const DEV_PASSWORD = "dev-password-123"; 
const USERS = [
  { email: "sam@example.com", name: "Sam" },
  { email: "alex@example.com", name: "Alex" },
  { email: "mina@example.com", name: "Mina" },
];

// Fixed dates (not "now") so every run produces the same data.
// Two dates are in the past, so the overdue endpoint has something to find.
const PROJECTS = [
  {
    name: "TaskFlow API",
    slug: "taskflow-api",
    description: "The backend you are building",
    tasks: [
      { title: "Design the schema", status: "done", priority: "high", dueDate: "2026-09-20" },
      { title: "Write migrations", status: "in_progress", priority: "high", dueDate: "2026-09-28" },
      { title: "Add authentication", status: "todo", priority: "high", dueDate: "2026-11-15" },
      { title: "Write integration tests", status: "todo", priority: "medium", dueDate: "2026-11-30" },
      { title: "Deploy to production", status: "todo", priority: "low", dueDate: undefined },
    ],
  },
  {
    name: "Website redesign",
    slug: "website-redesign",
    description: "A smaller project for variety",
    tasks: [
      { title: "Collect brand assets", status: "done", priority: "low", dueDate: undefined },
      { title: "Draft the landing page", status: "in_progress", priority: "medium", dueDate: "2026-11-05" },
    ],
  },
] as const;

try {
  // Users: upsert on a unique column, so re-running never duplicates or crashes
  const users = [];
  for (const u of USERS) {
        users.push(
      await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name },
        create: { ...u, passwordHash: await hashPassword(DEV_PASSWORD) },
      })
    );
  }

  for (const def of PROJECTS) {
    // name is not unique, so look it up first
    const project =
      (await prisma.project.findFirst({ where: { name: def.name } })) ??
      (await prisma.project.create({ data: { name: def.name,slug: def.slug, description: def.description } }));

    // membership has a composite primary key, so it can be upserted too
    for (const [i, user] of users.entries()) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        update: {},
        create: { projectId: project.id, userId: user.id, role: i === 0 ? "owner" : "member" },
      });
    }

    // only fill an empty project, so edits you make by hand are never overwritten
    if ((await prisma.task.count({ where: { projectId: project.id } })) === 0) {
      for (const [i, t] of def.tasks.entries()) {
        await prisma.task.create({
          data: {
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            projectId: project.id,
            assigneeId: users[i % users.length].id,
            comments:
              i % 2 === 0
                ? { create: [{ author: users[0].name, body: `Kicking off: ${t.title}` }] }
                : undefined,
          },
        });
      }
    }
  }

  console.log("Seed finished.");
} finally {
  await prisma.$disconnect();
}