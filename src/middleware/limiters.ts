import type { Request, Response } from "express";
import type { User } from "../types.js";
import { ipKey, makeLimiter } from "./rateLimit.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// One budget per account being attacked, whichever IP the guesses come from.
// Falls back to the IP if the body has no usable email (the request will be a 400 anyway).
function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim()
    ? `email:${email.trim().toLowerCase().slice(0, 254)}`
    : `ip:${ipKey(req)}`;
}

// Only valid on routes mounted AFTER `authenticate`
function userKey(_req: Request, res: Response): string {
  return `user:${(res.locals.user as User).id}`;
}

export const globalLimiter = makeLimiter({
  windowMs: MINUTE,
  limit: 300,
  skip: (req) => req.path === "/health", // monitors poll this constantly
  message: "Too many requests. Please slow down.",
});

export const registerLimiter = makeLimiter({
  windowMs: HOUR,
  limit: 5,
  message: "Too many accounts created from this address. Try again later.",
});

export const loginIpLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  skipSuccessfulRequests: true, // only failures count
  message: "Too many failed login attempts from this address. Try again later.",
});

export const loginAccountLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  key: emailKey,
  message: "Too many failed login attempts for this account. Try again later.",
});

export const refreshLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  limit: 60,
  message: "Too many token requests. Try again later.",
});

// Adding members by email reveals whether an account exists, so this is a sensitive flow
export const inviteLimiter = makeLimiter({
  windowMs: HOUR,
  limit: 20,
  key: userKey,
  message: "Too many member invitations. Try again later.",
});