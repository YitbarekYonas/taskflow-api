import { taskService } from "../container.js";
await taskService.addTask({ title: "My seeded task", priority: "high" });