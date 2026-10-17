import type { TaskQuery } from "../schemas/task.schemas.js";
import type { Priority, Task } from "../types.js";

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

export function applyQuery(all: Task[], q: TaskQuery) {
  let tasks = [...all];

  if (q.status) tasks = tasks.filter((t) => t.status === q.status);
  if (q.priority) tasks = tasks.filter((t) => t.priority === q.priority);
  if (q.search) {
    const needle = q.search.toLowerCase();
    tasks = tasks.filter((t) => t.title.toLowerCase().includes(needle));
  }

  const dir = q.order === "asc" ? 1 : -1;
  tasks.sort((a, b) => {
    let result = 0;
    switch (q.sort) {
      case "title":
        result = a.title.localeCompare(b.title);
        break;
      case "priority":
        result = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        break;
      case "createdAt":
        result = a.createdAt.localeCompare(b.createdAt);
        break;
      case "dueDate":
        if (!a.dueDate && !b.dueDate) return a.id - b.id;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        result = a.dueDate.localeCompare(b.dueDate);
        break;
    }
    return result !== 0 ? result * dir : a.id - b.id;
  });
  if (q.projectId) tasks = tasks.filter((t) => t.projectId === q.projectId);
  const total = tasks.length;
  const totalPages = Math.ceil(total / q.limit);
  const items = tasks.slice((q.page - 1) * q.limit, q.page * q.limit);

  return {
    items,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages,
      hasNext: q.page < totalPages,
      hasPrev: q.page > 1,
    },
  };
}