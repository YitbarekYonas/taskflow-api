import { SignJWT, jwtVerify } from "jose";
import { config } from "../config.js";
import { UnauthorizedError } from "../errors.js";

const key = new TextEncoder().encode(config.jwtSecret);
const ISSUER = "taskflow";
const AUDIENCE = "taskflow-api";

export function signAccessToken(userId: number): Promise<string> {
  return new SignJWT({}) 
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.accessTokenTtl)
    .sign(key);
}

// Returns the user id, or throws UnauthorizedError. The reason is deliberately not revealed.
export async function verifyAccessToken(token: string): Promise<number> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"], // an allow-list: never trust the alg the token announces
    });
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) throw new Error("bad subject");
    return id;
  } catch {
    throw new UnauthorizedError("Invalid or expired token.");
  }
}