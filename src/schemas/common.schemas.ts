import { z } from "zod";

// PostgreSQL's INTEGER maxes out at 2,147,483,647. A larger id can only be a bug or an attack.
export const MAX_DB_ID = 2_147_483_647;

// ids that arrive as strings (path and query)
export const dbId = z.coerce.number().int().positive().max(MAX_DB_ID);
// ids that arrive as JSON numbers (bodies)
export const dbIdBody = z.number().int().positive().max(MAX_DB_ID);

// Postgres text columns cannot hold the NUL character, and it would surface as a 500
export const noNul = (value: string) => !value.includes("\u0000");
export const NO_NUL_MESSAGE = "Text cannot contain null characters";

export const idParamSchema = z.object({ id: dbId });
export const taskIdParamSchema = z.object({ taskId: dbId });
export const commentParamsSchema = taskIdParamSchema.extend({ commentId: dbId });
export const memberParamsSchema = idParamSchema.extend({ userId: dbId });