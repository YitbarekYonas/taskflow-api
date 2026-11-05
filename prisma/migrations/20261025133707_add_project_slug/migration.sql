/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `projects` will be added. If there are existing duplicate values, this will fail.
  - The required column `slug` was added to the `projects` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- 1. expand: add the column as nullable
ALTER TABLE "projects" ADD COLUMN "slug" TEXT;

-- 2. backfill: existing rows get a readable, guaranteed-unique value (name + id)
UPDATE "projects"
SET "slug" = trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || "id";

-- 3. contract: now it is safe to require it and make it unique
ALTER TABLE "projects" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");