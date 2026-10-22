import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { prisma } from "./db.js";

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`TaskFlow API listening on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));