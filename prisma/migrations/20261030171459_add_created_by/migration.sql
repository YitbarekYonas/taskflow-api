-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "created_by_id" INTEGER;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "created_by_id" INTEGER;

-- CreateIndex
CREATE INDEX "projects_created_by_id_idx" ON "projects"("created_by_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_id_idx" ON "tasks"("created_by_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Backfill: a project's creator is its first "owner" member, if it has one
UPDATE "projects" p
SET "created_by_id" = (
  SELECT pm."user_id" FROM "project_members" pm
  WHERE pm."project_id" = p."id" AND pm."role" = 'owner'
  ORDER BY pm."joined_at" LIMIT 1
);

-- A task inherits its project's creator. Tasks without a project stay NULL (legacy, read-only).
UPDATE "tasks" t
SET "created_by_id" = (SELECT p."created_by_id" FROM "projects" p WHERE p."id" = t."project_id");