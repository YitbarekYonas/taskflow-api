import { z } from "zod";

const count = z.number().int().min(0);

export const projectStatsSchema = z.object({
  projectId: z.number().int().positive(),
  total: count,
  byStatus: z.object({ todo: count, in_progress: count, done: count }),
  byPriority: z.object({ low: count, medium: count, high: count }),
  overdue: count, // not done, due before today (UTC)
  dueSoon: count, // not done, due from today to 7 days ahead
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // the UTC date that overdue and dueSoon refer to
  computedAt: z.string(), // when this answer was computed: shows how old a cached answer is
});

export type ProjectStats = z.infer<typeof projectStatsSchema>;
