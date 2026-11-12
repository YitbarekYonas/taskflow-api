import pino from "pino";
import { config } from "./config.js";
import { getContext } from "./requestContext.js";

// Field NAMES whose values must never reach a log. Redaction is by name only, so also never log
// whole bodies or headers, and keep the leak test in tests/integration/logging.test.ts passing.
const SENSITIVE_KEYS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cookie",
  "jwtSecret",
  "databaseUrl",
];
// Each key at the top level, one level down and two levels down
export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return {
      type: typeof err,
      message: typeof err === "string" ? err : "a non-Error value was thrown",
    };
  }
  const out = pino.stdSerializers.err(err) as unknown as Record<string, unknown>;

  // A Prisma error message embeds the failing query WITH its argument values (a password hash,
  // an email). Keep only the final line, which holds the actual reason, and drop `meta`.
  if ("clientVersion" in err) {
    const message = typeof out.message === "string" ? out.message : "";
    out.message =
      message
        .split("\n")
        .filter((line) => line.trim())
        .at(-1) ?? "Database error";
    if (typeof out.stack === "string") {
      out.stack = out.stack
        .split("\n")
        .filter((line) => line.trim().startsWith("at "))
        .join("\n");
    }
    delete out.meta;
  }
  return out;
}

export function createLogger(level: string, destination: pino.DestinationStream) {
  return pino(
    {
      level,
      base: { service: "taskflow" }, // no pid or hostname: the platform adds its own
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
      serializers: { err: serializeError },
      // Runs on every log call: attaches the request this code is serving, if any
      mixin() {
        const context = getContext();
        if (!context) return {};
        return context.userId === undefined
          ? { requestId: context.requestId }
          : { requestId: context.requestId, userId: context.userId };
      },
    },
    destination,
  );
}

// In tests the output goes to a sink that tests can capture (silent by default).
// Everywhere else it goes straight to stdout as one JSON object per line.
const noop = () => {};
let sink: (line: string) => void = noop;

/** For tests only: capture log lines. Call with no argument to go silent again. */
export function setLogSink(fn: (line: string) => void = noop): void {
  sink = fn;
}

const destination: pino.DestinationStream =
  config.env === "test" ? { write: (line) => sink(line) } : pino.destination(1);

export const logger = createLogger(config.logLevel, destination);
