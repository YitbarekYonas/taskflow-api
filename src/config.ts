import "dotenv/config";
import path from "node:path";
import {z} from "zod";
const schema = z.object({
    NODE_ENV : z.enum(["development","test","production"]).default("development"),
    DATA_FILE : z.string().min(1).default("data/tasks.json"),
    LOG_LEVEL : z.enum(["debug","info","error"]).default("info")
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
    dataFile : parsed.data.DATA_FILE
};