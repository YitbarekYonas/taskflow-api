import type { Mailer } from "../mail/mailer.js";
import { renderTaskAssigned } from "../mail/templates.js";
import type { Repository } from "../repositories/repository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { Project, Task } from "../types.js";
import type { JobName, JobPayloads } from "./definitions.js";

export type JobResult = { outcome: "sent" } | { outcome: "skipped"; reason: string };
export type Handlers = { [K in JobName]: (payload: JobPayloads[K]) => Promise<JobResult> };

type Deps = {
  tasks: Pick<Repository<Task>, "findById">;
  projects: Pick<Repository<Project>, "findById">;
  users: Pick<UserRepository, "findById">;
  mailer: Mailer;
};

export function createHandlers({ tasks, projects, users, mailer }: Deps): Handlers {
  return {
    // Decides from the CURRENT state of the database, not from what the payload says, so running
    // the same job twice is harmless (at worst a repeated email), and nobody is told about an
    // assignment that no longer exists.
    "task-assigned": async ({ taskId, assigneeId, assignedById }) => {
      const task = await tasks.findById(taskId);
      if (!task) return { outcome: "skipped", reason: "task no longer exists" };
      if (task.assigneeId !== assigneeId) {
        return { outcome: "skipped", reason: "task is no longer assigned to this user" };
      }

      const [assignee, assigner, project] = await Promise.all([
        users.findById(assigneeId),
        users.findById(assignedById),
        task.projectId === undefined ? undefined : projects.findById(task.projectId),
      ]);
      if (!assignee) return { outcome: "skipped", reason: "assignee no longer exists" };

      await mailer.send(
        renderTaskAssigned({
          to: assignee.email,
          assigneeName: assignee.name,
          assignerName: assigner?.name ?? "Someone",
          task,
          projectName: project?.name,
        }),
      );
      return { outcome: "sent" };
    },
  };
}
