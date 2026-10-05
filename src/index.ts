import {readFile,writeFile} from "node:fs/promises";
type Task = { id: number; title:string; done:boolean; };
const FILE = "tasks.json";
async function load(): Promise<Task[]>{
    try{
        return JSON.parse(await readFile(FILE,"utf-8"));
    }catch{
        return [];
    }
}
async function save(tasks: Task[]){
    return writeFile(FILE,JSON.stringify(tasks,null,2));
}
async function main(){
    const [command, ...args] = process.argv.slice(2);
    const tasks = await load();
    if(command === "add"){
        const task = { id:Date.now(),title: args.join(" "), done : false};
        tasks.push(task);
        await save(tasks);
        console.log("Added",task.title);
    }else if(command === "list"){
        tasks.forEach((t)=> console.log(`${t.done ? "[x]" : "[]"} ${t.id} ${t.title}`));
    }else{
        console.log("Usage: add <title> | list");
    }
}
main();