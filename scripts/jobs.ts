import { config } from "../src/config.js";
import { BullJobQueue } from "../src/jobs/queue.js";
import { redisConnectionOptions } from "../src/redis.js";

const [command, id] = process.argv.slice(2);
if (!config.redisUrl) throw new Error("REDIS_URL is not set");

const queue = new BullJobQueue({ connection: redisConnectionOptions(config.redisUrl) });
try {
  if (command === "stats") {
    console.log(
      await queue.bull.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
    );
  } else if (command === "failed") {
    for (const job of await queue.bull.getFailed(0, 49)) {
      console.log(
        job.id,
        job.name,
        `attempts=${job.attemptsMade}`,
        `reason=${job.failedReason}`,
        JSON.stringify(job.data),
      );
    }
  } else if (command === "retry" && id) {
    const job = await queue.bull.getJob(id);
    if (!job) throw new Error(`no job ${id}`);
    await job.retry();
    console.log(`job ${id} queued again`);
  } else {
    console.log("usage: npm run jobs -- stats | failed | retry <jobId>");
  }
} finally {
  await queue.close();
}
