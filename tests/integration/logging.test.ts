import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "../../src/container.js";
import { logger, setLogSink } from "../../src/logger.js";
import { api } from "../support/app.js";
import { asUser } from "../support/auth.js";
import { createUser } from "../support/factories.js";
import { startSession } from "../support/sessions.js";

const INFO = 30;
const WARN = 40;
const ERROR = 50;

let lines: string[] = [];
const records = () => lines.map((line) => JSON.parse(line) as Record<string, any>);
const httpLines = () => records().filter((r) => r.event === "http.request");
const originalLevel = logger.level;

beforeAll(() => {
  logger.level = "trace"; // the most talkative setting: the worst case for leaks
});
beforeEach(() => {
  lines = [];
  setLogSink((line) => void lines.push(line));
});
afterAll(() => {
  logger.level = originalLevel;
  setLogSink();
});

describe("request logging", () => {
  it("writes one structured line per request, with the id from the response header", async () => {
    const res = await api().get("/health");

    const [line, ...others] = httpLines();
    expect(others).toHaveLength(0);
    expect(line).toMatchObject({
      event: "http.request",
      service: "taskflow",
      method: "GET",
      path: "/health",
      status: 200,
      level: INFO,
      requestId: res.headers["x-request-id"],
    });
    expect(typeof line.durationMs).toBe("number");
  });

  it.each([
    ["a success", "/health", 200, INFO],
    ["an unknown route", "/nope", 404, WARN],
    ["a missing login", "/tasks", 401, WARN],
  ])("logs %s at the right level", async (_name, path, status, level) => {
    await api().get(path);
    expect(httpLines()[0]).toMatchObject({ status, level });
  });

  it("records the path but never the query string", async () => {
    const user = await createUser();
    await (await asUser(user)).get("/tasks?search=needle-in-the-query");

    expect(httpLines()[0].path).toBe("/tasks");
    expect(lines.join("")).not.toContain("needle-in-the-query");
  });

  it("knows the user for authenticated requests and only for those", async () => {
    const user = await createUser();
    await (await asUser(user)).get("/auth/me");
    await api().get("/health");

    const [authenticated, anonymous] = httpLines();
    expect(authenticated.userId).toBe(user.id);
    expect(anonymous).not.toHaveProperty("userId");
  });
});

describe("unexpected failures", () => {
  it("logs the real cause at error level with the request id, while the client sees a generic answer", async () => {
    vi.spyOn(authService, "authenticate").mockRejectedValue(new Error("db down"));

    const res = await api().get("/auth/me").set("Authorization", "Bearer anything");

    expect(res.status).toBe(500);
    expect(res.text).not.toContain("db down");
    const failure = records().find((r) => r.level === ERROR && r.err);
    expect(failure?.err.message).toBe("db down");
    expect(failure?.requestId).toBe(res.headers["x-request-id"]);
  });

  it("does not write query arguments of a database error to the log", async () => {
    class FakePrismaError extends Error {
      clientVersion = "7.0.0";
      meta = { detail: "Key (email)=(LEAK@example.com)" };
      constructor() {
        super(
          'Invalid invocation\n  data: { passwordHash: "$argon2id$LEAK" }\n\nUnique constraint failed',
        );
      }
    }
    vi.spyOn(authService, "authenticate").mockRejectedValue(new FakePrismaError());

    await api().get("/auth/me").set("Authorization", "Bearer anything");

    expect(lines.join("")).not.toContain("LEAK");
    expect(lines.join("")).toContain("Unique constraint failed");
  });
});

describe("request ids reach code deep inside the application", () => {
  it("tags a security event written inside a service with the id of the request being served", async () => {
    const user = await createUser();
    const { token } = await startSession(user);
    await api().post("/auth/refresh").send({ refreshToken: token }); // rotates the token
    lines = [];

    const replay = await api().post("/auth/refresh").send({ refreshToken: token });

    expect(replay.status).toBe(401);
    // The service never receives a request id. It comes from the async context alone,
    // and this is a POST with a body, so it also proves the context survives the body parser.
    expect(records().find((r) => r.event === "auth.refresh_reuse")).toMatchObject({
      level: WARN,
      userId: user.id,
      requestId: replay.headers["x-request-id"],
      familyId: expect.any(String),
    });
  });

  it("never mixes up request ids when requests overlap", async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    const sessions = await Promise.all(users.map((u) => startSession(u)));
    await Promise.all(
      sessions.map((s) => api().post("/auth/refresh").send({ refreshToken: s.token })),
    );
    lines = [];

    const replays = await Promise.all(
      sessions.map((s) => api().post("/auth/refresh").send({ refreshToken: s.token })),
    );

    const events = records().filter((r) => r.event === "auth.refresh_reuse");
    expect(events).toHaveLength(6);
    users.forEach((user, index) => {
      const event = events.find((e) => e.userId === user.id);
      expect(event?.requestId).toBe(replays[index].headers["x-request-id"]);
    });
  });
});

describe("secrets", () => {
  it("never reach the log: not passwords, hashes, tokens, or even email addresses", async () => {
    const PASSWORD = "Sup3r-Secret-Marker-7Q";
    const WRONG_PASSWORD = "Wrong-Secret-Marker-3Z";
    const SHORT_PASSWORD = "Zq9-mk7!";
    const email = "marker@example.com";

    await api().post("/auth/register").send({ email, name: "Marker", password: PASSWORD });
    await api().post("/auth/register").send({ email, name: "Marker", password: SHORT_PASSWORD }); // 400
    await api().post("/auth/login").send({ email, password: WRONG_PASSWORD }); // 401
    const login = await api().post("/auth/login").send({ email, password: PASSWORD });
    const { accessToken, refreshToken } = login.body.data as {
      accessToken: string;
      refreshToken: string;
    };
    await api().get("/auth/me").set("Authorization", `Bearer ${accessToken}`);
    const refreshed = await api().post("/auth/refresh").send({ refreshToken });
    await api().post("/auth/refresh").send({ refreshToken }); // replay: logs a security event
    await api()
      .post("/auth/logout")
      .send({ refreshToken: refreshed.body.data.refreshToken as string });

    // Make sure the assertions below are not vacuous
    expect(httpLines().length).toBeGreaterThanOrEqual(8);
    expect(records().some((r) => r.event === "auth.refresh_reuse")).toBe(true);

    const output = lines.join("");
    for (const secret of [
      PASSWORD,
      WRONG_PASSWORD,
      SHORT_PASSWORD,
      accessToken,
      refreshToken,
      refreshed.body.data.refreshToken as string,
      "$argon2",
      email,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
