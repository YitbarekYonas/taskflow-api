import {addTask,listTasks,completeTask,deleteTask,exportCsv} from "./commands.js";
import {UserError} from "./errors.js";
function parseId(arg?:string): number{
    const id = Number(arg);
    if (!arg ||!Number.isInteger(id)){
        throw new UserError("Please provie a numeric task id.");
    }
    return id;
}
async function main(){
    const [commands,...args] = process.argv.slice(2);
    switch(commands){
        case "add":{
            const task = await addTask(args.join(" "));
            console.log(`Added #${task.id}: ${task.title}`);
            break;
        }
        case "list":{
            const tasks = await listTasks();
            if (tasks.length === 0) console.log("No task yet.");
            (await tasks).forEach((t)=>
                console.log(`${t.done ? "[x]":"[]"} #${t.id} ${t.title}`)
            );
            break;
        }
        case "done":{
            const task = await completeTask(parseId(args[0]));
            console.log(`completed #${task.id}: ${task.title}`);
            break;
        }
        case "delete":{
            const task = await deleteTask(parseId(args[0]));
            console.log(`Deleted #${task.id}: ${task.title}`);
            break;
        }
        case "export":{
            const file = await exportCsv(args[0] ?? "tasks.csv");
            console.log(`Exported to ${file}`);
            break;
        }
        default:
            console.log("Usage: add<title> | list | done<id> | deleted<id>");
    }
}
main().catch((err) =>{
    if(err instanceof UserError){
        console.error(`Error: ${err.message}`);
    }else{
        console.error(`Unexpected error:`,err);
    }
    process.exit(1);
});