import { mkdir, writeFile } from "node:fs/promises";
import { openApiSpec } from "../src/docs/openapi.js";

await mkdir(".tmp", { recursive: true });
await writeFile(".tmp/openapi.json", JSON.stringify(openApiSpec, null, 2));
console.log("Wrote .tmp/openapi.json");
