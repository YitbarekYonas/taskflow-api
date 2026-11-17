import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./db.js";
import { authService } from "./container.js";
import { connectRedis, closeRedis } from "./redis.js";

const app = createApp();
await connectRedis();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "TaskFlow API listening");
});

// Don't let a client hold a connection open forever while sending a request byte by byte
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

// Remove tokens that are already expired (rows are kept until then so reuse detection still works)
const purgeTimer = setInterval(
  () => {
    authService
      .purgeExpired()
      .then((n) => n > 0 && logger.info({ purged: n }, "purged expired refresh tokens"))
      .catch((err: unknown) => logger.error({ err }, "token purge failed"));
  },
  60 * 60 * 1000,
);
purgeTimer.unref(); // never keep the process alive just for this timer

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    Promise.all([closeRedis(), prisma.$disconnect()]).then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error({ err: error }, "cleanup failed during shutdown");
        process.exit(1);
      },
    );
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
