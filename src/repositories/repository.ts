import type { Project } from "../types.js";
import type { TaskQuery } from "../schemas/task.schemas.js";
import type { Status, Task } from "../types.js";

export interface TaskRepository extends Repository<Task> {
  // filter + sort + one page, plus the total number of matches
  query(q: TaskQuery): Promise<{ items: Task[]; total: number }>;
  findOverdue(today: string): Promise<Task[]>;
  countByStatus(): Promise<Record<Status, number>>;
  findByProject(projectId: number): Promise<Task[]>;
  moveAll(fromProjectId: number, toProjectId: number): Promise<number>;
  insertMany(items: Array<Omit<Task, "id">>): Promise<number>;
}
export interface ProjectRepository extends Repository<Project> {
  findAllWithTaskCount(): Promise<Array<Project & { taskCount: number }>>;
}
export interface Repository<T extends { id: number }> {
  findAll(): Promise<T[]>;
  findById(id: number): Promise<T | undefined>;
  insert(data: Omit<T, "id">): Promise<T>;
  update(id: number, changes: Partial<Omit<T, "id">>): Promise<T | undefined>;
  remove(id: number): Promise<T | undefined>;
}