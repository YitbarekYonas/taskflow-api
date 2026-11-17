import { describe, expect, it } from "vitest";
import { createLogger } from "../../src/logger.js";
import { runWithContext, setContextUser } from "../../src/requestContext.js";

function capture(level = "trace") {
  const lines: string[] = [];
  const log = createLogger(level, { write: (line) => void lines.push(line) });
  const records = () => lines.map((line) => JSON.parse(line) as Record<string, any>);
  return { log, lines, records };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("log format", () => {
  it("writes one JSON object per line with level, time, service and message", () => {
    const { log, lines, records } = capture();
    log.info({ event: "demo" }, "hello");

    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith("\n")).toBe(true);
    expect(records()[0]).toMatchObject({
      level: 30,
      service: "taskflow",
      event: "demo",
      msg: "hello",
    });
    expect(new Date(records()[0].time as string).toISOString()).toBe(records()[0].time);
  });

  it("drops lines below the configured level", () => {
    const { log, lines } = capture("info");
    log.debug("not shown");
    log.info("shown");
    expect(lines).toHaveLength(1);
  });

  it("writes nothing at all when silent", () => {
    const { log, lines } = capture("silent");
    log.error("nobody hears this");
    expect(lines).toHaveLength(0);
  });
});

describe("redaction", () => {
  it.each([
    ["a top-level password", { password: "LEAK" }],
    ["a password hash", { passwordHash: "$argon2id$LEAK" }],
    ["a nested access token", { data: { accessToken: "LEAK" } }],
    ["a refresh token two levels down", { response: { data: { refreshToken: "LEAK" } } }],
    ["an authorization header", { req: { headers: { authorization: "Bearer LEAK" } } }],
    ["a cookie header", { headers: { cookie: "session=LEAK" } }],
    ["the database URL", { config: { databaseUrl: "postgresql://user:LEAK@host/db" } }],
  ])("redacts %s", (_name, fields) => {
    const { log, lines } = capture();
    log.info(fields, "message");

    expect(lines[0]).not.toContain("LEAK");
    expect(lines[0]).toContain("[Redacted]");
  });

  it("leaves ordinary fields alone", () => {
    const { log, records } = capture();
    log.info({ userId: 7, event: "demo", status: 201 }, "ok");
    expect(records()[0]).toMatchObject({ userId: 7, event: "demo", status: 201 });
  });

  // These two tests document the LIMITS of redaction. They are why the integration test sends
  // real traffic through the whole API and checks the output.
  it("known limit: a secret under a field name that is not on the list is NOT redacted", () => {
    const { log, lines } = capture();
    log.info({ pwd: "VISIBLE" }, "careless");
    expect(lines[0]).toContain("VISIBLE");
  });

  it("known limit: a secret inside a message string is NOT redacted", () => {
    const { log, lines } = capture();
    log.info("login with password VISIBLE");
    expect(lines[0]).toContain("VISIBLE");
  });
});

describe("error serialization", () => {
  it("keeps the type, message and stack of an ordinary error", () => {
    const { log, records } = capture();
    log.error({ err: new TypeError("something broke") }, "failed");

    expect(records()[0].err).toMatchObject({ type: "TypeError", message: "something broke" });
    expect(records()[0].err.stack).toContain("TypeError");
  });

  it("does not leak the query arguments embedded in a Prisma error", () => {
    class FakePrismaError extends Error {
      clientVersion = "7.0.0";
      code = "P2002";
      meta = { cause: "Key (email)=(LEAK@example.com) already exists" };
      constructor() {
        super(
          '\nInvalid `prisma.user.create()` invocation in\n/app/x.ts:48:29\n\n  45 data: { passwordHash: "$argon2id$LEAK" }\n\nUnique constraint failed on the constraint: `users_email_key`',
        );
        this.name = "PrismaClientKnownRequestError";
      }
    }
    const { log, lines, records } = capture();
    log.error({ err: new FakePrismaError() }, "failed");

    expect(lines[0]).not.toContain("LEAK");
    expect(records()[0].err.message).toBe(
      "Unique constraint failed on the constraint: `users_email_key`",
    );
    expect(records()[0].err.code).toBe("P2002");
  });

  it("copes with a thrown value that is not an Error", () => {
    const { log, records } = capture();
    log.error({ err: "just a string" }, "failed");
    expect(records()[0].err).toEqual({ type: "string", message: "just a string" });
  });
});

describe("request context", () => {
  it("adds the request id to every line written inside the context, and not outside", () => {
    const { log, records } = capture();
    log.info("outside");
    runWithContext({ requestId: "req-1" }, () => log.info("inside"));

    expect(records()[0]).not.toHaveProperty("requestId");
    expect(records()[1]).toMatchObject({ requestId: "req-1" });
  });

  it("survives awaits and timers", async () => {
    const { log, records } = capture();
    await runWithContext({ requestId: "req-async" }, async () => {
      await sleep(5);
      await Promise.resolve();
      log.info("after awaiting");
    });
    expect(records()[0]).toMatchObject({ requestId: "req-async" });
  });

  it("keeps overlapping requests apart", async () => {
    const { log, records } = capture();
    await Promise.all(
      ["a", "b", "c", "d", "e"].map((id, i) =>
        runWithContext({ requestId: `req-${id}` }, async () => {
          await sleep(10 - i * 2); // finish in the opposite order they started
          log.info({ who: id }, "done");
        }),
      ),
    );

    for (const record of records()) expect(record.requestId).toBe(`req-${record.who}`);
    expect(records()).toHaveLength(5);
  });

  it("picks up the user once authentication has set it", () => {
    const { log, records } = capture();
    runWithContext({ requestId: "req-2" }, () => {
      log.info("before authentication");
      setContextUser(42);
      log.info("after authentication");
    });

    expect(records()[0]).not.toHaveProperty("userId");
    expect(records()[1]).toMatchObject({ requestId: "req-2", userId: 42 });
  });

  it("lets an explicit field win over the context without duplicating the key", () => {
    const { log, lines, records } = capture();
    runWithContext({ requestId: "from-context" }, () => log.info({ requestId: "explicit" }, "x"));

    expect(lines[0].match(/"requestId"/g)).toHaveLength(1);
    expect(records()[0].requestId).toBe("explicit");
  });
});
