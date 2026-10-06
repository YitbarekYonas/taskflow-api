import {readFile,writeFile} from "node:fs/promises";
type Task = { id: number; title:string; done:boolean; };
const FILE = "tasks.json";
class UserError extends Error{}
async function load(): Promise<Task[]>{
    try{
        return JSON.parse(await readFile(FILE,"utf-8"));
    }catch (err){
        if((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
    }
}
function parseId(arg?: string): number {
    const id = Number(arg);
    if(!arg || !Number.isInteger(id)){
        throw new UserError("Please provide a numberic task id;");
    }
    return id;
}
function findTask(tasks:Task[],id:number){
    const task = tasks.find((t)=> id === t.id);
    if(!task) throw new UserError(`No task found with id ${id}.`);
    return task;
}
async function save(tasks: Task[]){
    return writeFile(FILE,JSON.stringify(tasks,null,2));
}
async function main(){
    const [command, ...args] = process.argv.slice(2);
    const tasks = await load();
    switch (command){
        case 'add':{
            const title = args.join(" ").trim();
            if(!title) throw new UserError("Task title can't be empty.");
            const id = tasks.reduce((max,t)=> Math.max(max,t.id),0) + 1;
            tasks.push({id,title,done:false});
            await save(tasks);
            console.log(`Add #${id}: ${title}`);
            break;
        }
        case 'list':{
            if(tasks.length === 0) console.log("No task add yet.");
            tasks.forEach((t)=>
                console.log(`${t.done ? "[x]" : "[]"} #${t.id} ${t.title}`)
            );
            break;
        }
        case 'done':{
            const task = findTask(tasks,parseId(args[0]));
            task.done = true;
            await save(tasks);
            console.log(`Completed ${task.id} ${task.title}` );
            break;
        }
        case 'delete': {
            const task = findTask(tasks,parseId(args[0]));
            await save(tasks.filter((t) => t.id !== task.id));
            console.log(`Deleted ${task.id} ${task.title}`);
            break;
        }
        default:
            console.log("Usage: add <title> | list | done <id> | delete <id>");
}
}
main().catch((err) =>{
    if (err instanceof UserError){
        console.log(`Error:${err.message}`);
    }else{
        console.error("Unexpected error:",err);
    }
    process.exit(1);
})
