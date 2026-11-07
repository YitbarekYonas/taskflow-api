import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictError, DuplicateError, ForbiddenError, InUseError, InvalidReferenceError,
  NotFoundError, UnauthorizedError, UserError,
} from "../../../src/errors.js";
import { logger } from "../../../src/logger.js";
import { errorHandler } from "../../../src/middleware/errorHandler.js";

vi.mock("../../../src/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Just enough of Express's req/res to see what the handler decided
function run(err: unknown) {
  const res = {
    locals: { requestId: "req-123" },
    statusCode: 0,
    body: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    set(name: string, value: string) { this.headers[name] = value; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const req = { method: "GET", originalUrl: "/x", ip: "127.0.0.1" };
  errorHandler(err, req as unknown as Request, res as unknown as Response, vi.fn());
  return res;
}

describe("errorHandler", () => {
  it.each([
    ["NotFoundError", new NotFoundError("gone"), 404],
    ["UserError", new UserError("bad input"), 400],
    ["InvalidReferenceError", new InvalidReferenceError("bad reference"), 400],
    ["ConflictError", new ConflictError("clash"), 409],
    ["DuplicateError (a ConflictError)", new DuplicateError("duplicate"), 409],
    ["InUseError (a ConflictError)", new InUseError("in use"), 409],
    ["UnauthorizedError (a UserError)", new UnauthorizedError("who are you"), 401],
    ["ForbiddenError (a UserError)", new ForbiddenError("not allowed"), 403],
    ["malformed JSON", Object.assign(new Error("x"), { type: "entity.parse.failed" }), 400],
    ["an oversized body", Object.assign(new Error("x"), { type: "entity.too.large" }), 413],
  ])("%s -> %i", (_name, error, status) => {
    expect(run(error).statusCode).toBe(status);
  });

  it("tells a 401 client how to authenticate", () => {
    expect(run(new UnauthorizedError("no")).headers["WWW-Authenticate"]).toContain("Bearer");
  });

  it("reports validation problems with the path of each field", () => {
    const error = z.object({ title: z.string().min(1) }).safeParse({ title: "" }).error!;
    const res = run(error);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: "title" })]);
  });

  it("hides the cause of an unexpected error but logs it and returns the request id", () => {
    const res = run(new Error("connection to db at 10.0.0.5 failed, password=hunter2"));
    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe("Internal server error");
    expect(res.body.error.requestId).toBe("req-123");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(logger.error).toHaveBeenCalled();
  });
});