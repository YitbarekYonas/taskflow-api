import type { Express } from "express";
import request from "supertest";
import type { Test } from "supertest";
import { signAccessToken } from "../../src/auth/tokens.js";
import { app as defaultApp } from "./app.js";

// Returns a tiny client whose every request carries this user's access token
export async function asUser(user: { id: number }, target: Express = defaultApp) {
  const token = await signAccessToken(user.id);
  const authed = (req: Test) => req.set("Authorization", `Bearer ${token}`);

  return {
    get: (url: string) => authed(request(target).get(url)),
    post: (url: string, body?: object) => authed(request(target).post(url)).send(body),
    patch: (url: string, body?: object) => authed(request(target).patch(url)).send(body),
    delete: (url: string) => authed(request(target).delete(url)),
  };
}
