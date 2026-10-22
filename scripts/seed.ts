import { taskService } from "../src/container.js";
import { prisma } from "../src/db.js";

const priorities = ["low", "medium", "high"] as const;

for (let i = 1; i <= 25; i++) {
  await taskService.addTask({
    title: `Seed task ${i}`,
    priority: priorities[i % 3],
    dueDate: i % 4 === 0 ? undefined : `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
  });
}
console.log("Seeded 25 tasks");
await prisma.$disconnect();