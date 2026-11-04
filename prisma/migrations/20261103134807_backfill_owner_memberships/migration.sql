-- Every project's creator becomes an owner member (or is upgraded to owner if already a member)
INSERT INTO "project_members" ("project_id", "user_id", "role")
SELECT "id", "created_by_id", 'owner'::"MemberRole"
FROM "projects"
WHERE "created_by_id" IS NOT NULL
ON CONFLICT ("project_id", "user_id") DO UPDATE SET "role" = 'owner'::"MemberRole";