import type { Test } from "supertest";
import { signAccessToken } from "../../src/auth/tokens.js";
import { api } from "./app.js";

// Returns a tiny client whose every request carries this user's access token
export async function asUser(user: { id: number }) {
  const token = await signAccessToken(user.id);
  const authed = (req: Test) => req.set("Authorization", `Bearer ${token}`);

  return {
    get: (url: string) => authed(api().get(url)),
    post: (url: string, body?: object) => authed(api().post(url)).send(body),
    patch: (url: string, body?: object) => authed(api().patch(url)).send(body),
    delete: (url: string) => authed(api().delete(url)),
  };
}
