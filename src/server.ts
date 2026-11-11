import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./db.js";
import { authService } from "./container.js";
const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`TaskFlow API listening on http://localhost:${config.port}`);
});
// Don't let a client hold a connection open forever while sending a request byte by byte
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;

// Remove tokens that are already expired (rows are kept until then so reuse detection still works)
const purgeTimer = setInterval(
  () => {
    authService
      .purgeExpired()
      .then((n) => n > 0 && logger.info(`Purged ${n} expired refresh tokens`))
      .catch((err) => logger.error("Token purge failed:", err));
  },
  60 * 60 * 1000,
);
purgeTimer.unref(); // never keep the process alive just for this timer
function shutdown(signal: string) {
  clearInterval(purgeTimer);
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    prisma.$disconnect().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error("Disconnect failed during shutdown:", error);
        process.exit(1);
      },
    );
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
