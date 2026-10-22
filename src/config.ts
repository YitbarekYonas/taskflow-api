import "dotenv/config";
import path from "node:path";
import {z} from "zod";
const schema = z.object({
    NODE_ENV : z.enum(["development","test","production"]).default("development"),
    DATA_FILE : z.string().min(1).default("data/tasks.json"),
    LOG_LEVEL : z.enum(["debug","info","error"]).default("info"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
    DATABASE_URL: z.string().min(1).startsWith("postgres"),
    STORAGE: z.enum(["prisma", "json"]).default("prisma"),
});
const parsed = schema.safeParse(process.env);
if(!parsed.success){
    console.error("Invalid enviroment configuration:");
    for (const issue of parsed.error.issues){
        console.error(`-${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}
export const config ={
    env : parsed.data.NODE_ENV,
    logLevel : parsed.data.LOG_LEVEL,
    dataFile : parsed.data.DATA_FILE,
    port: parsed.data.PORT,
    corsOrigins: parsed.data.CORS_ORIGIN,
    databaseUrl: parsed.data.DATABASE_URL,
    storage: parsed.data.STORAGE,
};