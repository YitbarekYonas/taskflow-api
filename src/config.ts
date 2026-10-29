import "dotenv/config";
import path from "node:path";
import {z} from "zod";
const schema = z.object({
    NODE_ENV : z.enum(["development","test","production"]).default("development"),
    LOG_LEVEL : z.enum(["debug","info","error"]).default("info"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
    DATABASE_URL: z.string().min(1).startsWith("postgres"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
});
const parsed = schema.safeParse(process.env);
if(!parsed.success){
    console.error("Invalid enviroment configuration:");
    for (const issue of parsed.error.issues){
        console.error(`-${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}
if (parsed.data.NODE_ENV === "production" && /replace-me/i.test(parsed.data.JWT_SECRET)) {
  console.error("Refusing to start: JWT_SECRET is still the placeholder from .env.example.");
  process.exit(1);
}
export const config ={
    env : parsed.data.NODE_ENV,
    logLevel : parsed.data.LOG_LEVEL,
    port: parsed.data.PORT,
    corsOrigins: parsed.data.CORS_ORIGIN,
    databaseUrl: parsed.data.DATABASE_URL,
    jwtSecret: parsed.data.JWT_SECRET,
    accessTokenTtl: parsed.data.ACCESS_TOKEN_TTL_SECONDS,
};