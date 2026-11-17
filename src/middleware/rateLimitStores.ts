import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import type { Redis } from "ioredis";

// Decrement only if the key still exists. A plain DECR on an expired key would recreate it
// WITHOUT an expiry, and that client would be blocked forever.
const DECREMENT_IF_EXISTS =
  "if redis.call('EXISTS', KEYS[1]) == 1 then return redis.call('DECR', KEYS[1]) end return 0";

/** A fixed-window counter in Redis: INCR + PEXPIRE NX + PTTL, in one MULTI/EXEC. */
export class RedisCounterStore implements Store {
  localKeys = false;
  private windowMs = 60_000;

  constructor(
    private readonly client: Redis,
    private readonly keyPrefix: string,
  ) {}

  init(options: Pick<Options, "windowMs">): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redisKey = this.keyPrefix + key;
    const results = await this.client
      .multi()
      .incr(redisKey)
      .pexpire(redisKey, this.windowMs, "NX") // only the FIRST hit starts the window
      .pttl(redisKey)
      .exec();

    if (!results) throw new Error("Redis transaction was discarded");
    for (const [error] of results) if (error) throw error;

    const totalHits = Number(results[0][1]);
    let ttlMs = Number(results[2][1]);
    if (ttlMs < 0) {
      // Safety net: a counter must never exist without an expiry
      await this.client.pexpire(redisKey, this.windowMs);
      ttlMs = this.windowMs;
    }
    return { totalHits, resetTime: new Date(Date.now() + ttlMs) };
  }

  async decrement(key: string): Promise<void> {
    await this.client.eval(DECREMENT_IF_EXISTS, 1, this.keyPrefix + key);
  }

  async resetKey(key: string): Promise<void> {
    await this.client.del(this.keyPrefix + key);
  }
}

/** Uses the primary store, and falls back to the secondary one whenever the primary fails. */
export class ResilientStore implements Store {
  localKeys = false;

  constructor(
    private readonly primary: Store,
    private readonly fallback: Store,
    private readonly onFallback: (error: unknown, operation: string) => void,
  ) {}

  init(options: Options): void {
    void this.primary.init?.(options);
    void this.fallback.init?.(options);
  }

  private async run<T>(operation: string, action: (store: Store) => T | Promise<T>): Promise<T> {
    try {
      return await action(this.primary);
    } catch (error) {
      this.onFallback(error, operation);
      return await action(this.fallback);
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    return await this.run("increment", (store) => store.increment(key));
  }

  async decrement(key: string): Promise<void> {
    await this.run("decrement", (store) => store.decrement(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.run("resetKey", (store) => store.resetKey(key));
  }
}
