import { authService } from "../src/container.js";
import { prisma } from "../src/db.js";

try {
  console.log(`Purged ${await authService.purgeExpired()} expired refresh tokens`);
} finally {
  await prisma.$disconnect();
}