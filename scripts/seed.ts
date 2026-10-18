import { taskService } from "../src/container.js";
await taskService.addTask({ title: "My seeded task", priority: "high" });