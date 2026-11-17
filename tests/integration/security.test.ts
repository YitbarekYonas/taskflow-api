import { describe, expect, it, vi } from "vitest";
import { authService } from "../../src/container.js";
import { api } from "../support/app.js";
import { logger } from "../../src/logger.js";

describe("response headers", () => {
  it("sets the hardening headers and hides the framework", async () => {
    const res = await api().get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("echoes a safe request id and replaces an unsafe one", async () => {
    const safe = await api().get("/health").set("X-Request-Id", "my-test-request-1");
    const unsafe = await api().get("/health").set("X-Request-Id", "bad id with spaces!");

    expect(safe.headers["x-request-id"]).toBe("my-test-request-1");
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id with spaces!");
    expect(unsafe.headers["x-request-id"]).toMatch(/^[\w-]{8,64}$/);
  });
});

describe("CORS", () => {
  it("allows the configured origin to send the Authorization header", async () => {
    const res = await api()
      .options("/tasks")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "authorization");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-headers"].toLowerCase()).toContain("authorization");
  });

  it("gives an unknown origin nothing to work with", async () => {
    const res = await api()
      .options("/tasks")
      .set("Origin", "http://evil.example")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("errors", () => {
  it("answers unknown routes with JSON, so a reflected path can never become HTML", async () => {
    const res = await api().get("/%3Cscript%3Ealert(1)%3C/script%3E");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.text).not.toMatch(/node_modules|\/home\/|\bat\s+\S+\s+\(/);
  });

  it("answers an oversized body with 413 and the standard error shape", async () => {
    const res = await api()
      .post("/auth/login")
      .send({ email: "a@example.com", password: "x".repeat(200_000) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { message: expect.any(String) } });
  });

  it("hides the cause of an unexpected failure but returns the request id for the logs", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(authService, "authenticate").mockRejectedValue(new Error("db down, password=hunter2"));

    const res = await api().get("/auth/me").set("Authorization", "Bearer anything");

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(res.text).not.toContain("hunter2");
    expect(errorLog).toHaveBeenCalled(); // the real cause went to the log, not to the client
  });
});
