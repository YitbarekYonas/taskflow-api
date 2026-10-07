import {load,save} from "./storage.js";
import {UserError} from "./errors.js";
import type {Task} from "./types.js";
import {createWriteStream} from "node:fs";
import path from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
function findTask(tasks:Task [],id:number){
    const task = tasks.find((t) => t.id === id);
    if(!task) throw new UserError(`No task found with id ${id}`);
    return task;
}
export async function addTask(title:string): Promise<Task>{
    const clean = title.trim();
    if(!clean) throw new UserError("Task title can not be empty.");
    const tasks = await load();
    const id = tasks.reduce((max,t) => Math.max(max,t.id),0) + 1;
    const task : Task = {id, title:clean,done:false};
    tasks.push(task);
    await save(tasks);
    return task;
}
export async function listTasks(): Promise<Task[]>{
    return load();
}
export async function completeTask(id:number): Promise<Task>{
    const tasks = await load();
    const task = findTask(tasks,id);
    task.done = true;
    await save(tasks);
    return task;
}
export async function deleteTask(id:number): Promise<Task>{
    const tasks = await load();
    const task = findTask(tasks,id);
    await save(tasks.filter((t)=> t.id === id));
    return task;
}
function csvEscape(value:string):string{
    return `"${value.replaceAll('"','""')}"`;
}
export async function exportCsv(outFile:string): Promise<string>{
    if(path.extname(outFile) !== ".csv"){
        throw new UserError("Export file must end with .csv");
    }
    const target = path.resolve(outFile);
    const tasks = await load();
    await pipeline(
        Readable.from(tasks),
        async function* (source: AsyncIterable<Task>) {
            yield "id,title,done\n";
            for await (const t of source){
                yield `${t.id}, ${csvEscape(t.title)},${t.done}\n`;
            }
        },
        createWriteStream(target)
    );
    return target;
}