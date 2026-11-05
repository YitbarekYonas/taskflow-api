import type { Request, RequestHandler, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { config } from "../config.js";

type Spec = {
  windowMs: number;
  limit: number;
  message: string;
  key?: (req: Request, res: Response) => string;
  skipSuccessfulRequests?: boolean;
  skip?: (req: Request) => boolean;
};

export function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? "unknown");
}

export function makeLimiter(spec: Spec): RequestHandler {
  if (!config.rateLimitEnabled) return (_req, _res, next) => next();

  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.limit,
    standardHeaders: "draft-7", // RateLimit and RateLimit-Policy headers
    legacyHeaders: false,
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
    skip: spec.skip ? (req) => spec.skip!(req) : undefined,
    keyGenerator: (req, res) => (spec.key ?? ipKey)(req, res),
    // Same error shape as the rest of the API
    handler: (_req, res) => {
      const retryAfter = Number(res.getHeader("Retry-After")) || Math.ceil(spec.windowMs / 1000);
      res.status(429).json({ error: { message: spec.message, retryAfterSeconds: retryAfter } });
    },
  });
}