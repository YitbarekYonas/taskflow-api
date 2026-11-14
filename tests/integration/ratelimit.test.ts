import type { Express } from "express";
import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signAccessToken } from "../../src/auth/tokens.js";
import { TEST_REDIS_URL } from "../support/env.js";
import { createProject, createUser, TEST_PASSWORD } from "../support/factories.js";
import { assertTestRedis, flushTestRedis } from "../support/redis.js";

let app: Express;
let teardown: () => Promise<void>;

// The same behavior must hold whichever store keeps the counters
describe.each(["memory", "redis"] as const)("rate limits with the %s store", (store) => {
  beforeAll(async () => {
    assertTestRedis();
    await flushTestRedis(); // counters from earlier runs would otherwise still be there
    vi.stubEnv("RATE_LIMIT_ENABLED", "true");
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    vi.stubEnv("REDIS_URL", store === "redis" ? TEST_REDIS_URL : "");
    vi.resetModules(); // load a fresh copy of the app that sees the values above
    const { createApp } = await import("../../src/app.js");
    const { prisma } = await import("../../src/db.js");
    const { connectRedis, closeRedis } = await import("../../src/redis.js");
    if (store === "redis") expect(await connectRedis()).toBe(true);
    app = createApp();
    teardown = async () => {
      await closeRedis();
      await prisma.$disconnect();
    };
  });

  afterAll(async () => {
    await teardown();
  });

  // A fresh client address for every test: the limiters count per address
  let clients = 0;
  const newClient = () => {
    const n = ++clients;
    return `10.1.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  };

  function send(
    method: "get" | "post",
    ip: string,
    url: string,
    body?: object,
    options: { token?: string; origin?: string } = {},
  ) {
    let req = request(app)[method](url).set("X-Forwarded-For", ip);
    if (options.token) req = req.set("Authorization", `Bearer ${options.token}`);
    if (options.origin) req = req.set("Origin", options.origin);
    return method === "post" ? req.send(body ?? {}) : req;
  }

  const wrongLogin = (ip: string, email: string) =>
    send("post", ip, "/auth/login", { email, password: "wrong-password-1" });

  describe("POST /auth/register: 5 per hour per address", () => {
    it("answers 429 on the sixth request, counting invalid requests too", async () => {
      const ip = newClient();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++)
        statuses.push((await send("post", ip, "/auth/register", {})).status);

      expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);
    });

    it("tells the client how long to wait, in the standard error shape", async () => {
      const ip = newClient();
      for (let i = 0; i < 5; i++) await send("post", ip, "/auth/register", {});

      const res = await send("post", ip, "/auth/register", {});

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        error: { message: expect.any(String), retryAfterSeconds: expect.any(Number) },
      });
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
      expect(res.headers["ratelimit"] ?? res.headers["ratelimit-policy"]).toBeDefined();
    });

    it("still carries the CORS headers a browser needs to read the 429", async () => {
      const ip = newClient();
      for (let i = 0; i < 5; i++) await send("post", ip, "/auth/register", {});

      const res = await send("post", ip, "/auth/register", {}, { origin: "http://localhost:5173" });

      expect(res.status).toBe(429);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not affect other addresses", async () => {
      const ip = newClient();
      for (let i = 0; i < 6; i++) await send("post", ip, "/auth/register", {});

      expect((await send("post", newClient(), "/auth/register", {})).status).toBe(400);
    });
  });

  describe("POST /auth/login: 10 failures per account per 15 minutes", () => {
    it("blocks the 11th failure on one account, even when every attempt comes from a different address", async () => {
      const user = await createUser();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++)
        statuses.push((await wrongLogin(newClient(), user.email)).status);

      expect(statuses).toEqual([...Array(10).fill(401), 429]);
    });

    it("gives one budget to every spelling of the same email", async () => {
      const base = `case-${newClient()}@example.com`;
      const spellings = [base, base.toUpperCase(), ` ${base} `, base.replace("case", "CaSe")];
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++)
        statuses.push((await wrongLogin(newClient(), spellings[i % 4])).status);

      expect(statuses[10]).toBe(429);
    });

    it("also blocks the correct password while throttled (the documented cost of this design)", async () => {
      const user = await createUser();
      for (let i = 0; i < 10; i++) await wrongLogin(newClient(), user.email);

      const res = await send("post", newClient(), "/auth/login", {
        email: user.email,
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(429);
    });

    it("leaves other accounts alone", async () => {
      const victim = await createUser();
      const bystander = await createUser();
      for (let i = 0; i < 11; i++) await wrongLogin(newClient(), victim.email);

      expect((await wrongLogin(newClient(), bystander.email)).status).toBe(401);
    });
  });

  describe("POST /auth/login: 30 failures per address per 15 minutes", () => {
    it("blocks the 31st failure from one address whichever accounts it targets, and successful logins do not count", async () => {
      const user = await createUser();
      const ip = newClient();
      const statuses: number[] = [];

      for (let i = 0; i < 29; i++)
        statuses.push((await wrongLogin(ip, `nobody${i}-${ip}@example.com`)).status);
      for (let i = 0; i < 5; i++) {
        const ok = await send("post", ip, "/auth/login", {
          email: user.email,
          password: TEST_PASSWORD,
        });
        expect(ok.status).toBe(200);
      }
      statuses.push((await wrongLogin(ip, `last-${ip}@example.com`)).status); // failure number 30
      statuses.push((await wrongLogin(ip, `over-${ip}@example.com`)).status); // failure number 31

      expect(statuses.slice(0, 30).every((status) => status === 401)).toBe(true);
      expect(statuses[30]).toBe(429);
    });
  });

  describe("POST /auth/refresh and /auth/logout: 60 per address per 15 minutes, shared", () => {
    it("shares one budget between the two endpoints", async () => {
      const ip = newClient();
      const token = "x".repeat(43);
      const statuses: number[] = [];
      for (let i = 0; i < 30; i++)
        statuses.push((await send("post", ip, "/auth/refresh", { refreshToken: token })).status);
      for (let i = 0; i < 30; i++)
        statuses.push((await send("post", ip, "/auth/logout", { refreshToken: token })).status);

      expect(statuses.slice(0, 30).every((status) => status === 401)).toBe(true);
      expect(statuses.slice(30).every((status) => status === 204)).toBe(true);
      expect((await send("post", ip, "/auth/refresh", { refreshToken: token })).status).toBe(429);
      expect((await send("post", ip, "/auth/logout", { refreshToken: token })).status).toBe(429);
    });
  });

  describe("POST /projects/:id/members: 20 invitations per hour per user", () => {
    it("limits per user, whichever address the requests come from, and each user has their own budget", async () => {
      const owner = await createUser();
      const other = await createUser();
      const project = await createProject({ owner });
      const ownerToken = await signAccessToken(owner.id);
      const otherToken = await signAccessToken(other.id);

      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        const res = await send(
          "post",
          newClient(),
          `/projects/${project.id}/members`,
          { email: `ghost${i}@example.com` },
          { token: ownerToken },
        );
        statuses.push(res.status);
      }

      expect(statuses).toEqual([...Array(20).fill(404), 429]); // 404: no such user, so the handler ran
      const stranger = await send(
        "post",
        newClient(),
        `/projects/${project.id}/members`,
        { email: "ghost@example.com" },
        { token: otherToken },
      );
      expect(stranger.status).toBe(404); // not a member of the project, but not rate limited either
    });
  });

  describe("the global limit: 300 requests per minute per address", () => {
    it("answers 429 after 300 requests from one address, but never for /health, and not for other addresses", async () => {
      const ip = newClient();
      const statuses: number[] = [];
      for (let i = 0; i < 300; i++) statuses.push((await send("get", ip, "/nope")).status);

      expect(new Set(statuses)).toEqual(new Set([404]));
      expect((await send("get", ip, "/nope")).status).toBe(429);
      expect((await send("get", ip, "/health")).status).toBe(200);
      expect((await send("get", newClient(), "/nope")).status).toBe(404);
    });
  });

  if (store === "redis") {
    describe("Redis specifics", () => {
      it("keeps the counters in Redis, under a prefix per limiter, with an expiry", async () => {
        const ip = newClient();
        await send("post", ip, "/auth/register", {});
        const inspector = new Redis(TEST_REDIS_URL);
        try {
          expect(await inspector.get(`rl:register:${ip}`)).toBe("1");
          expect(await inspector.pttl(`rl:register:${ip}`)).toBeGreaterThan(0);
        } finally {
          inspector.disconnect();
        }
      });

      it("never puts an email address into a Redis key", async () => {
        await wrongLogin(newClient(), "someone.private@example.com");
        const inspector = new Redis(TEST_REDIS_URL);
        try {
          const keys = (await inspector.keys("rl:*")).join("\n");
          expect(keys).toContain("rl:login-account:");
          expect(keys).not.toContain("someone.private");
          expect(keys).not.toContain("@");
        } finally {
          inspector.disconnect();
        }
      });
    });
  }
});
