import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";


export type Db = PrismaClient | Prisma.TransactionClient;