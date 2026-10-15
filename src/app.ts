import express from "express";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { tasksRouter } from "./routes/tasks.routes.js";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
  app.use("/tasks", tasksRouter);

  app.use(notFound);      // after all routes
  app.use(errorHandler);  // always last

  return app;
}