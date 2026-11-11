import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signAccessToken, verifyAccessToken } from "../../../src/auth/tokens.js";
import { config } from "../../../src/config.js";
import { UnauthorizedError } from "../../../src/errors.js";

const key = new TextEncoder().encode(config.jwtSecret);
const NOW = new Date("2026-11-06T12:00:00Z");
const nowSeconds = () => Math.floor(Date.now() / 1000);
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// Builds tokens a careful attacker (or a buggy client) might send
function forge(
  o: {
    sub?: string | null;
    key?: Uint8Array;
    exp?: number;
    iss?: string;
    aud?: string;
    alg?: "HS256" | "HS512";
  } = {},
) {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: o.alg ?? "HS256" })
    .setIssuer(o.iss ?? "taskflow")
    .setAudience(o.aud ?? "taskflow-api")
    .setIssuedAt()
    .setExpirationTime(o.exp ?? nowSeconds() + 600);
  if (o.sub !== null) jwt = jwt.setSubject(o.sub ?? "42");
  return jwt.sign(o.key ?? key);
}

describe("signAccessToken and verifyAccessToken", () => {
  it("round-trips the user id", async () => {
    expect(await verifyAccessToken(await signAccessToken(42))).toBe(42);
  });

  it("carries no claims beyond the standard ones (no role, no email)", async () => {
    const token = await signAccessToken(42);
    expect(Object.keys(decode(token.split(".")[1])).sort()).toEqual([
      "aud",
      "exp",
      "iat",
      "iss",
      "sub",
    ]);
  });

  it("expires after the configured lifetime", async () => {
    const token = await signAccessToken(42);

    vi.setSystemTime(new Date(NOW.getTime() + (config.accessTokenTtl - 60) * 1000));
    await expect(verifyAccessToken(token)).resolves.toBe(42);

    vi.setSystemTime(new Date(NOW.getTime() + (config.accessTokenTtl + 60) * 1000));
    await expect(verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([
    ["garbage", async () => "not.a.token"],
    ["an empty string", async () => ""],
    ["an expired token", () => forge({ exp: nowSeconds() - 10 })],
    [
      "a token signed with another secret",
      () => forge({ key: new TextEncoder().encode("another-secret-of-at-least-32-characters!!") }),
    ],
    ["the wrong audience", () => forge({ aud: "someone-else" })],
    ["the wrong issuer", () => forge({ iss: "evil" })],
    ["no subject", () => forge({ sub: null })],
    ["a non-numeric subject", () => forge({ sub: "abc" })],
    ["a negative subject", () => forge({ sub: "-5" })],
    ["a zero subject", () => forge({ sub: "0" })],
    ["an algorithm that is not on the allow-list", () => forge({ alg: "HS512" })],
    [
      "alg none (unsigned)",
      async () => {
        const real = await signAccessToken(42);
        return `${b64({ alg: "none", typ: "JWT" })}.${real.split(".")[1]}.`;
      },
    ],
    [
      "a tampered payload with the old signature",
      async () => {
        const [header, payload, signature] = (await signAccessToken(42)).split(".");
        return `${header}.${b64({ ...decode(payload), sub: "1" })}.${signature}`;
      },
    ],
  ])("rejects %s, always with the same message", async (_name, make) => {
    const error = await verifyAccessToken(await make()).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe("Invalid or expired token.");
  });
});
