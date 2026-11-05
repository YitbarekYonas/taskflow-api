-- CreateIndex
CREATE INDEX "tasks_created_at_id_idx" ON "tasks"("created_at", "id");

-- CreateIndex
CREATE INDEX "tasks_status_due_date_id_idx" ON "tasks"("status", "due_date", "id");
