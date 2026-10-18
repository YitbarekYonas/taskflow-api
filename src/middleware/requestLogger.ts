import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
      logger.info(
      `${res.locals.requestId} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
    );
  });
  next();
}