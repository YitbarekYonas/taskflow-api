import { parseArgs } from "node:util";
import { taskService } from "./container.js";
import { UserError } from "./errors.js";
import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from "./types.js";
import { parseChoice } from "./utils.js";
const { addTask, listTasks, setStatus, deleteTask, exportCsv, listOverdue, summary } = taskService;
type Command =
  | { kind: "add"; title: string; priority?: Priority; dueDate?: string }
  | { kind: "list"; status?: Status }
  | { kind: "start"; id: number }
  | { kind: "done"; id: number }
  | { kind: "delete"; id: number }
  | { kind: "export"; file: string }
  | { kind: "help" }| { kind: "overdue" }
  | { kind: "summary" };

const MARKS: Record<Status, string> = {
  todo: "[ ]",
  in_progress: "[~]",
  done: "[x]",
};

function formatTask(t: Task): string {
  const due = t.dueDate ? ` (due ${t.dueDate})` : "";
  return `${MARKS[t.status]} #${t.id} [${t.priority}] ${t.title}${due}`;
}

function parseId(arg?: string): number {
  const id = Number(arg);
  if (!arg || !Number.isInteger(id)) {
    throw new UserError("Please provide a numeric task id.");
  }
  return id;
}

function readArgs(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        priority: { type: "string", short: "p" },
        due: { type: "string", short: "d" },
        status: { type: "string", short: "s" },
      },
    });
  } catch (err) {
    throw new UserError((err as Error).message);
  }
}

function parseCommand(argv: string[]): Command {
  const {
    values,
    positionals: [name, ...rest],
  } = readArgs(argv);

  switch (name) {
    case "add":
      return {
        kind: "add",
        title: rest.join(" "),
        priority: parseChoice(values.priority, PRIORITIES, "priority"),
        dueDate: values.due,
      };
    case "list":
      return { kind: "list", status: parseChoice(values.status, STATUSES, "status") };
    case "start":
    case "done":
    case "delete":
      return { kind: name, id: parseId(rest[0]) };
    case "export":
      return { kind: "export", file: rest[0] ?? "tasks.csv" };
    case "overdue":
      return { kind: "overdue" };
    case "summary":
      return { kind: "summary" };
    default:
      return { kind: "help" };
  }
}

async function run(cmd: Command): Promise<void> {
  switch (cmd.kind) {
    case "add": {
      const task = await addTask({
        title: cmd.title,
        priority: cmd.priority,
        dueDate: cmd.dueDate,
      });
      console.log(`Added #${task.id}: ${task.title}`);
      break;
    }
    case "list": {
      const tasks = await listTasks({ status: cmd.status });
      if (tasks.length === 0) console.log("No tasks found.");
      tasks.forEach((t) => console.log(formatTask(t)));
      break;
    }
    case "start": {
      const task = await setStatus(cmd.id, "in_progress");
      console.log(`Started #${task.id}: ${task.title}`);
      break;
    }
    case "done": {
      const task = await setStatus(cmd.id, "done");
      console.log(`Completed #${task.id}: ${task.title}`);
      break;
    }
    case "delete": {
      const task = await deleteTask(cmd.id);
      console.log(`Deleted #${task.id}: ${task.title}`);
      break;
    }
    case "export": {
      console.log(`Exported to ${await exportCsv(cmd.file)}`);
      break;
    }
    case "help": {
      console.log(
        "Usage:\n" +
          "  add <title> [-p low|medium|high] [-d YYYY-MM-DD]\n" +
          "  list [-s todo|in_progress|done]\n" +
          "  start <id> | done <id> | delete <id>\n" +
          "  export [file.csv]   (CSV format)"

      );
      break;
    }
    case "overdue": {
      const tasks = await listOverdue();
      if (tasks.length === 0) console.log("Nothing overdue.");
      tasks.forEach((t) => console.log(formatTask(t)));
      break;
    }
    case "summary": {
      const counts = await summary();
      console.log(`todo: ${counts.todo}  in progress: ${counts.in_progress}  done: ${counts.done}`);
      break;
    }
    default: {

      const unreachable: never = cmd;
      throw new Error(`Unhandled command: ${JSON.stringify(unreachable)}`);
    }
  }
}

async function main() {
  await run(parseCommand(process.argv.slice(2)));
}

main().catch((err) => {
  if (err instanceof UserError) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});