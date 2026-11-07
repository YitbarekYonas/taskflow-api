import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { openApiSpec } from "./docs/openapi.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { projectsRouter } from "./routes/projects.routes.js";
import { tasksRouter } from "./routes/tasks.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { authenticate } from "./middleware/authenticate.js";
import { 
  globalLimiter, 
  loginIpLimiter, 
  registerLimiter, 
  refreshLimiter 
} from "./middleware/limiters.js";

export function createApp() {
  const app = express();

  // Number of REAL proxies in front of this app.
  app.set("trust proxy", config.trustProxyHops > 0 ? config.trustProxyHops : false);

  // Docs are mounted before helmet so Swagger UI can load its assets.
  if (config.docsEnabled) {
    app.get("/openapi.json", (_req, res) => {
      res.json(openApiSpec);
    });
    app.use(
      "/docs",
      swaggerUi.serve,
      swaggerUi.setup(openApiSpec, { customSiteTitle: "TaskFlow API docs" })
    );
  }

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
  app.use(globalLimiter);
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/auth/login", loginIpLimiter);
  app.use("/auth/register", registerLimiter);
  app.use("/auth/refresh", refreshLimiter);

  app.use("/tasks", authenticate, tasksRouter);
  app.use("/projects", authenticate, projectsRouter);
  app.use("/auth", authRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}