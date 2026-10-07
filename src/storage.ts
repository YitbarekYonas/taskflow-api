import {readFile,writeFile} from "node:fs/promises";
import type {Task} from "./types.js";
const FILE = "tasks.json";
export async function load(): Promise<Task []>{
    try{
        return JSON.parse(await readFile(FILE,"utf-8"));
    }catch(err){
        if((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }
}
export async function save(tasks:Task[]): Promise<void>{
    await writeFile(FILE,JSON.stringify(tasks,null,2));
}