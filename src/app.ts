import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { openApiSpec } from "./docs/openapi.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { authenticate } from "./middleware/authenticate.js";

export function createApp() {
  const app = express();

  // Docs are mounted before helmet so Swagger UI can load its assets
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
  <head>
    <title>TaskFlow API docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });</script>
  </body>
</html>`);
  });

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "X-Request-Id", "Authorization"],
      exposedHeaders: ["X-Request-Id", "Location"],
      maxAge: 600,
    })
  );
  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
  app.use("/tasks", authenticate, tasksRouter);
  app.use("/projects", authenticate, projectsRouter);
  app.use("/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}