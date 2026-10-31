import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./db.js";
import { authService } from "./container.js";
const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`TaskFlow API listening on http://localhost:${config.port}`);
});

// Remove tokens that are already expired (rows are kept until then so reuse detection still works)
const purgeTimer = setInterval(
  () => {
    authService
      .purgeExpired()
      .then((n) => n > 0 && logger.info(`Purged ${n} expired refresh tokens`))
      .catch((err) => logger.error("Token purge failed:", err));
  },
  60 * 60 * 1000
);
purgeTimer.unref(); // never keep the process alive just for this timer
function shutdown(signal: string) {
  clearInterval(purgeTimer);
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));