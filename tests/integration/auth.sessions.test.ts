import { describe, expect, it } from "vitest";
import { hashRefreshToken } from "../../src/auth/refreshTokens.js";
import { config } from "../../src/config.js";
import { authService } from "../../src/container.js";
import { prisma } from "../../src/db.js";
import { api } from "../support/app.js";
import { signAccessToken } from "../../src/auth/tokens.js";
import { createUser } from "../support/factories.js";
import { rowFor, startSession } from "../support/sessions.js";

const refresh = (token: string) => api().post("/auth/refresh").send({ refreshToken: token });
const logout = (token: string) => api().post("/auth/logout").send({ refreshToken: token });
const me = (accessToken: string) =>
  api().get("/auth/me").set("Authorization", `Bearer ${accessToken}`);
const INVALID = "Invalid or expired refresh token.";

describe("POST /auth/refresh", () => {
  it("rotates the token: a new pair is issued and the old token is marked used", async () => {
    const user = await createUser();
    const { token, familyId } = await startSession(user);

    const res = await refresh(token);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: config.accessTokenTtl,
      refreshExpiresIn: config.refreshTokenTtlDays * 86_400,
      user: { id: user.id },
    });
    expect(res.body.data.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.body.data.refreshToken).not.toBe(token);
    expect((await rowFor(token)).usedAt).not.toBeNull();

    const next = await rowFor(res.body.data.refreshToken);
    expect(next.familyId).toBe(familyId);
    expect(next.usedAt).toBeNull();
    expect((await me(res.body.data.accessToken)).body.data.id).toBe(user.id);
  });

  it("can be chained: each new token works exactly once", async () => {
    const user = await createUser();
    const { token } = await startSession(user);

    const second = await refresh(token);
    const third = await refresh(second.body.data.refreshToken);

    expect(third.status).toBe(200);
    expect((await refresh(second.body.data.refreshToken)).status).toBe(401);
  });

  it("revokes the whole family when an used token is replayed, and issues nothing new", async () => {
    const user = await createUser();
    const { token, familyId } = await startSession(user);
    const rotated = await refresh(token);
    const rowsBefore = await prisma.refreshToken.count({ where: { familyId } });

    const replay = await refresh(token);

    expect(replay.status).toBe(401);
    expect(replay.body.error.message).toBe(INVALID);
    expect(await prisma.refreshToken.count({ where: { familyId } })).toBe(rowsBefore);
    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(rotated.body.data.refreshToken)).status).toBe(401); // the newest token died too
  });

  it("does not touch the user's other sessions when one family is revoked", async () => {
    const user = await createUser();
    const phone = await startSession(user);
    const laptop = await startSession(user);
    await refresh(phone.token);
    await refresh(phone.token); // replay: the phone's family is revoked

    expect((await refresh(laptop.token)).status).toBe(200);
  });

  it("answers identically for unknown, logged-out, replayed and expired tokens", async () => {
    const user = await createUser();
    const unknown = await refresh("x".repeat(43));

    const loggedOut = await startSession(user);
    await logout(loggedOut.token);
    const revoked = await refresh(loggedOut.token);

    const expiredSession = await startSession(user, { expiresAt: new Date(Date.now() - 60_000) });
    const expired = await refresh(expiredSession.token);

    for (const res of [unknown, revoked, expired]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { message: INVALID } });
    }
    expect((await rowFor(expiredSession.token)).usedAt).toBeNull(); // an expired token is not "used"
  });

  it("fails once the user is deleted, because the sessions are deleted with them", async () => {
    const user = await createUser();
    const { token } = await startSession(user);
    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.refreshToken.count()).toBe(0);
    expect((await refresh(token)).status).toBe(401);
  });

  it.each([
    ["no body", {}],
    ["a token that is too short", { refreshToken: "abc" }],
    ["a token that is not a string", { refreshToken: 12345678901234567890 }],
    ["an extra field", { refreshToken: "x".repeat(43), admin: true }],
  ])("rejects %s with 400", async (_name, body) => {
    expect((await api().post("/auth/refresh").send(body)).status).toBe(400);
  });

  it("lets exactly one of several simultaneous refreshes with the same token succeed, every time", async () => {
    const user = await createUser();

    for (let round = 0; round < 5; round++) {
      const { token } = await startSession(user);
      const results = await Promise.all(Array.from({ length: 6 }, () => refresh(token)));

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status !== 200).every((r) => r.status === 401)).toBe(true);
      // Deliberately NOT asserted: whether the winner's new token survives. The losers revoke the
      // family, and whether that happens before or after the winner's insert depends on timing.
    }
  });
});

describe("POST /auth/logout", () => {
  it("revokes the whole family, including tokens issued by earlier refreshes", async () => {
    const user = await createUser();
    const { token, familyId } = await startSession(user);
    const rotated = await refresh(token);

    const res = await logout(rotated.body.data.refreshToken);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const rows = await prisma.refreshToken.findMany({ where: { familyId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(rotated.body.data.refreshToken)).status).toBe(401);
  });

  it("answers 204 every time, for unknown tokens and repeats too, so it reveals nothing", async () => {
    const user = await createUser();
    const { token } = await startSession(user);

    expect((await logout(token)).status).toBe(204);
    expect((await logout(token)).status).toBe(204);
    expect((await logout("x".repeat(43))).status).toBe(204);
  });

  it("leaves the user's other sessions alone", async () => {
    const user = await createUser();
    const phone = await startSession(user);
    const laptop = await startSession(user);

    await logout(phone.token);

    expect((await refresh(laptop.token)).status).toBe(200);
  });

  it("needs a refresh token in the body", async () => {
    expect((await api().post("/auth/logout").send({})).status).toBe(400);
  });

  it("known limitation: an access token that was already issued keeps working until it expires", async () => {
    const user = await createUser();
    const { token } = await startSession(user);
    const accessToken = await signAccessToken(user.id);

    await logout(token);

    expect((await me(accessToken)).status).toBe(200); // stateless tokens cannot be recalled
  });
});

describe("POST /auth/logout-all", () => {
  it("requires an access token", async () => {
    expect((await api().post("/auth/logout-all")).status).toBe(401);
  });

  it("ends every session of the caller and nobody else's", async () => {
    const user = await createUser();
    const other = await createUser();
    const phone = await startSession(user);
    const laptop = await startSession(user);
    const strangers = await startSession(other);

    const res = await api()
      .post("/auth/logout-all")
      .set("Authorization", `Bearer ${await signAccessToken(user.id)}`);

    expect(res.status).toBe(204);
    expect((await refresh(phone.token)).status).toBe(401);
    expect((await refresh(laptop.token)).status).toBe(401);
    expect((await refresh(strangers.token)).status).toBe(200);
  });
});

describe("purging expired tokens", () => {
  it("removes only rows that are already expired, and keeps used and revoked rows that could still matter", async () => {
    const user = await createUser();
    await startSession(user, { expiresAt: new Date(Date.now() - 60_000) }); // expired: goes
    const valid = await startSession(user); // valid: stays
    const used = await startSession(user);
    await refresh(used.token); // used: stays (replay detection needs it)
    const revoked = await startSession(user);
    await logout(revoked.token); // revoked: stays

    const removed = await authService.purgeExpired();

    expect(removed).toBe(1);
    for (const t of [valid.token, used.token, revoked.token]) {
      expect(await prisma.refreshToken.count({ where: { tokenHash: hashRefreshToken(t) } })).toBe(
        1,
      );
    }
  });
});
