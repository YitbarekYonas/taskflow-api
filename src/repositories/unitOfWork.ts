import type { Comment } from "../types.js";
import type { ProjectRepository, Repository, TaskRepository } from "./repository.js";

export type TxRepositories = {
  tasks: TaskRepository;
  projects: ProjectRepository;
  comments: Repository<Comment>;
};

export interface UnitOfWork {
  // Everything done through `repos` commits together, or rolls back if `work` throws
  run<T>(work: (repos: TxRepositories) => Promise<T>): Promise<T>;
}