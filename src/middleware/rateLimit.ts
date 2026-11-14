import type { Request, RequestHandler, Response } from "express";
import { MemoryStore, ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Store } from "express-rate-limit";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { redis } from "../redis.js";
import { RedisCounterStore, ResilientStore } from "./rateLimitStores.js";

type Spec = {
  name: string;
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

const FALLBACK_LOG_INTERVAL_MS = 30_000;
const lastFallbackLog = new Map<string, number>();

function logFallback(limiter: string, operation: string, err: unknown) {
  const now = Date.now();
  if (now - (lastFallbackLog.get(limiter) ?? 0) < FALLBACK_LOG_INTERVAL_MS) return;
  lastFallbackLog.set(limiter, now);
  logger.warn(
    { event: "rate_limit.store_fallback", limiter, operation, err },
    "redis unavailable: this limiter is counting in memory (per instance) until it recovers",
  );
}

function buildStore(name: string): Store | undefined {
  const client = redis;
  if (!client) return undefined; // express-rate-limit then uses its own in-memory store
  return new ResilientStore(
    new RedisCounterStore(client, `rl:${name}:`),
    new MemoryStore(),
    (error, operation) => logFallback(name, operation, error),
  );
}

export function makeLimiter(spec: Spec): RequestHandler {
  if (!config.rateLimitEnabled) return (_req, _res, next) => next();

  const store = buildStore(spec.name);

  return rateLimit({
    windowMs: spec.windowMs,
    limit: spec.limit,
    standardHeaders: "draft-7", // RateLimit and RateLimit-Policy headers
    legacyHeaders: false,
    validate: {
      singleCount: false, // ResilientStore may retry on the fallback after the primary fails
    },
    skipSuccessfulRequests: spec.skipSuccessfulRequests ?? false,
    skip: spec.skip ? (req) => spec.skip!(req) : undefined,
    keyGenerator: (req, res) => (spec.key ?? ipKey)(req, res),
    ...(store ? { store } : {}),
    // Same error shape as the rest of the API
    handler: (_req, res) => {
      const retryAfter = Number(res.getHeader("Retry-After")) || Math.ceil(spec.windowMs / 1000);
      res.status(429).json({ error: { message: spec.message, retryAfterSeconds: retryAfter } });
    },
  });
}
