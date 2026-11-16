import type { Task } from "../types.js";
import type { MailMessage } from "./mailer.js";

// Anything a user typed that ends up in a mail is flattened to one line: a newline in a header
// is how "Bcc: evil@example.com" gets smuggled in.
export const oneLine = (text: string, max: number): string =>
  text
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .trim()
    .slice(0, max);

export function renderTaskAssigned(input: {
  to: string;
  assigneeName: string;
  assignerName: string;
  task: Pick<Task, "id" | "title" | "priority" | "dueDate">;
  projectName?: string;
}): MailMessage {
  const title = oneLine(input.task.title, 150);
  const assigner = oneLine(input.assignerName, 80);
  const where = input.projectName ? ` in ${oneLine(input.projectName, 80)}` : "";

  const lines = [
    `Hi ${oneLine(input.assigneeName, 80)},`,
    "",
    `${assigner} assigned you a task${where}:`,
    "",
    `  ${title}`,
    `  Priority: ${input.task.priority}`,
    ...(input.task.dueDate ? [`  Due: ${input.task.dueDate}`] : []),
    "",
    "You are receiving this because you are a member of the project.",
  ];

  return {
    to: input.to,
    subject: oneLine(`${assigner} assigned you: ${title}`, 200),
    text: lines.join("\n"),
  };
}
