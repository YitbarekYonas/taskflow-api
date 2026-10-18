import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { NotFoundError, UserError,ConflictError } from "../errors.js";
import { logger } from "../logger.js";

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if ((err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: { message: "Request body is not valid JSON" } });
    return;
  }
    if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ error: { message: "Request body is too large" } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: "Validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { message: err.message } });
    return;
  }
    if (err instanceof ConflictError) {
    res.status(409).json({ error: { message: err.message } });
    return;
  }
  if (err instanceof UserError) {
    res.status(400).json({ error: { message: err.message } });
    return;
  }
  logger.error(`[${res.locals.requestId}] Unhandled error:`, err);
  res.status(500).json({
    error: { message: "Internal server error", requestId: res.locals.requestId },
  });
};