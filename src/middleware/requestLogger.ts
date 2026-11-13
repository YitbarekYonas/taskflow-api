import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const locals = res.locals as { requestId?: string; user?: { id: number } };

    logger[level](
      {
        event: "http.request",
        requestId: locals.requestId,
        userId: locals.user?.id,
        method: req.method,
        path: req.originalUrl.split("?")[0], // never the query string
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10,
        ip: req.ip,
      },
      "request completed",
    );
  });

  next();
}
