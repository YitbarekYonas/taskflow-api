import type { PrismaClient } from "../../generated/prisma/client.js";
import type { TxRepositories, UnitOfWork } from "../unitOfWork.js";
import { PrismaCommentRepository } from "./comment.repository.js";
import { PrismaProjectRepository } from "./project.repository.js";
import { PrismaTaskRepository } from "./task.repository.js";

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  run<T>(work: (repos: TxRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (tx) =>
        work({
          tasks: new PrismaTaskRepository(tx),
          projects: new PrismaProjectRepository(tx),
          comments: new PrismaCommentRepository(tx),
        }),
      { maxWait: 5_000, timeout: 10_000 } // never wait or hold a connection forever
    );
  }
}