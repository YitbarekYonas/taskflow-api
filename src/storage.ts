import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { taskSchema, type Task } from "./types.js";


function migrate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const record = raw as Record<string, unknown>;
  if ("done" in record && !("status" in record)) {
    const { done, ...rest } = record;
    return {
      ...rest,
      status: done ? "done" : "todo",
      priority: "medium",
      createdAt: new Date().toISOString(),
    };
  }
  return raw;
}

export async function load(): Promise<Task[]> {
  let text: string;
  try {
    text = await readFile(config.dataFile, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error(`${config.dataFile} is corrupted: expected a JSON array`);
  }

  const tasks = z.array(taskSchema).parse(data.map(migrate));
  logger.debug(`Loaded ${tasks.length} tasks from ${config.dataFile}`);
  return tasks;
}

export async function save(tasks: Task[]): Promise<void> {
  await mkdir(path.dirname(config.dataFile), { recursive: true });
  await writeFile(config.dataFile, JSON.stringify(tasks, null, 2));
  logger.debug(`Saved ${tasks.length} tasks`);
}