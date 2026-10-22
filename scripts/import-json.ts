import path from "node:path";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { JsonFileRepository } from "../src/repositories/jsonFileRepository.js";
import { migrateLegacyTask } from "../src/repositories/legacy.js";
import {
  commentSchema, projectSchema, taskSchema,
  type Comment, type Project, type Task,
} from "../src/types.js";

try {
  const dir = path.dirname(config.dataFile);
  const projects = await new JsonFileRepository<Project>(path.join(dir, "projects.json"), projectSchema).findAll();
  const tasks = await new JsonFileRepository<Task>(config.dataFile, taskSchema, migrateLegacyTask).findAll();
  const comments = await new JsonFileRepository<Comment>(path.join(dir, "comments.json"), commentSchema).findAll();
  console.log(`Found ${projects.length} projects, ${tasks.length} tasks, ${comments.length} comments`);

  if ((await prisma.task.count()) + (await prisma.project.count()) > 0) {
    throw new Error("Database is not empty; refusing to import over existing data");
  }

  const projectIds = new Set(projects.map((p) => p.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const fixedTasks = tasks.map((t) => {
    if (t.projectId !== undefined && !projectIds.has(t.projectId)) {
      console.warn(`task ${t.id}: project ${t.projectId} is gone, clearing projectId`);
      return { ...t, projectId: undefined };
    }
    return t;
  });
  const goodComments = comments.filter((c) => {
    const ok = taskIds.has(c.taskId);
    if (!ok) console.warn(`comment ${c.id}: task ${c.taskId} is gone, skipping`);
    return ok;
  });


  await prisma.$transaction(async (tx) => {
    await tx.project.createMany({
      data: projects.map((p) => ({
        id: p.id, name: p.name, description: p.description ?? null, createdAt: new Date(p.createdAt),
      })),
    });
    await tx.task.createMany({
      data: fixedTasks.map((t) => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        createdAt: new Date(t.createdAt), projectId: t.projectId ?? null,
      })),
    });
    await tx.comment.createMany({
      data: goodComments.map((c) => ({
        id: c.id, taskId: c.taskId, author: c.author, body: c.body,
        createdAt: new Date(c.createdAt), updatedAt: c.updatedAt ? new Date(c.updatedAt) : null,
      })),
    });
    
    for (const table of ["projects", "tasks", "comments"]) {
      await tx.$queryRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('${table}','id'), COALESCE(MAX(id),0)+1, false) FROM ${table}`
      );
    }
  });
  console.log("Import finished.");
} finally {
  await prisma.$disconnect();
}