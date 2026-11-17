import type { Comment } from "../types.js";
import type { MemberRepository } from "./memberRepository.js";
import type { ProjectRepository, Repository, TaskRepository } from "./repository.js";
import type { UserRepository } from "./userRepository.js";

export type TxRepositories = {
  tasks: TaskRepository;
  projects: ProjectRepository;
  comments: Repository<Comment>;
  members: MemberRepository;
  users: UserRepository;
};

export interface UnitOfWork {
  // Everything done through `repos` commits together, or rolls back if `work` throws
  run<T>(work: (repos: TxRepositories) => Promise<T>): Promise<T>;
}
