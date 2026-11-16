import { config } from "./config.js";
import { handlers, mailer } from "./container.js";
import { prisma } from "./db.js";
import { startWorker } from "./jobs/worker.js";
import { logger } from "./logger.js";
import { redisConnectionOptions } from "./redis.js";

if (config.jobsMode !== "queue" || !config.redisUrl) {
  logger.error({ jobsMode: config.jobsMode }, "the worker needs JOBS_MODE=queue and REDIS_URL");
  process.exit(1);
}

const worker = startWorker({ connection: redisConnectionOptions(config.redisUrl), handlers });
logger.info({ event: "worker.started" }, "worker started, waiting for jobs");

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "shutting down: finishing the active jobs first");
  try {
    await worker.close(); // stops taking jobs and waits for the running ones to finish
    if ("close" in mailer && typeof mailer.close === "function") mailer?.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "error during shutdown");
    process.exit(1);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error(
    { err: reason },
    "unhandled rejection: exiting so the supervisor restarts the worker",
  );
  process.exit(1);
});
