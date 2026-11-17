import { z } from "zod";
import { dbIdBody } from "../schemas/common.schemas.js";

export const QUEUE_NAME = "notifications"; // BullMQ queue names must not contain ":"

// Payloads hold ids only. The worker reads everything else from the database at the time it runs.
export const jobSchemas = {
  "task-assigned": z
    .object({ taskId: dbIdBody, assigneeId: dbIdBody, assignedById: dbIdBody })
    .strict(),
} as const;

export type JobName = keyof typeof jobSchemas;
export type JobPayloads = { [K in JobName]: z.infer<(typeof jobSchemas)[K]> };
