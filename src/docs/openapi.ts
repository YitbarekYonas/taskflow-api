import { z } from "zod";
import { createCommentSchema, updateCommentSchema } from "../schemas/comment.schemas.js";
import {
  createProjectSchema,
  duplicateProjectSchema,
  mergeProjectSchema,
  updateProjectSchema,
  addMemberSchema,
  changeRoleSchema,
} from "../schemas/project.schemas.js";
import { SORT_FIELDS, createTaskSchema, updateTaskSchema } from "../schemas/task.schemas.js";
import {
  PRIORITIES,
  ROLES,
  STATUSES,
  commentSchema,
  projectSchema,
  taskSchema,
  userSchema,
} from "../types.js";
import { registerSchema, loginSchema, refreshSchema } from "../schemas/auth.schemas.js";
import { readFileSync } from "node:fs";

// package.json sits two folders above this file in both src/docs/ and dist/docs/
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
) as { version: string };
function schemaOf(schema: z.ZodType, io: "input" | "output" = "input") {
  const { $schema: _schema, ...rest } = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
  return rest;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const envelope = (name: string) => ({
  type: "object",
  properties: { data: ref(name) },
});
const listOf = (name: string) => ({
  type: "object",
  properties: { data: { type: "array", items: ref(name) } },
});
const errorRef = (
  name: "BadRequest" | "NotFound" | "Conflict" | "Unauthorized" | "Forbidden" | "RateLimited",
) => ({
  $ref: `#/components/responses/${name}`,
});
const query = (name: string, schema: object, description?: string) => ({
  name,
  in: "query",
  required: false,
  schema,
  description,
});

const created = (name: string) => ({
  description: "Created",
  headers: { Location: { schema: { type: "string" }, description: "URL of the new resource" } },
  content: json(envelope(name)),
});
const ok = (name: string, description = "OK") => ({
  description,
  content: json(envelope(name)),
});
const noContent = { description: "Deleted, no body" };

const taskListParams = [
  query("status", { type: "string", enum: [...STATUSES] }),
  query("priority", { type: "string", enum: [...PRIORITIES] }),
  query("projectId", { type: "integer", minimum: 1 }),
  query("search", { type: "string" }, "Case-insensitive match on the title"),
  query(
    "sort",
    { type: "string", enum: [...SORT_FIELDS], default: "createdAt" },
    "Tasks without a due date always sort last",
  ),
  query("order", { type: "string", enum: ["asc", "desc"], default: "asc" }),
  query("page", { type: "integer", minimum: 1, default: 1 }),
  query("limit", { type: "integer", minimum: 1, maximum: 100, default: 10 }),
];

export const baseSpec = {
  openapi: "3.1.0",
  info: {
    title: "TaskFlow API",
    version: version,
    description:
      "A task-management API built with Node.js, Express and TypeScript.\n\n" +
      'All errors share one shape: `{ "error": { "message": "..." } }`. ' +
      "Validation errors add a `details` array, and unexpected 500s include a `requestId`.",
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  security: [{ bearerAuth: [] }],
  servers: [{ url: "/" }],
  tags: [
    { name: "System", description: "Health check and API metadata" },
    { name: "Auth", description: "Registration, login, tokens and logout" },
    { name: "Tasks", description: "Create, read, update and delete tasks" },
    { name: "Projects", description: "Projects, their members, and duplicate/merge" },
    { name: "Comments", description: "Comments on tasks" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          200: {
            description: "The service is running",
            content: json({
              type: "object",
              properties: {
                status: { type: "string", example: "ok" },
                uptime: { type: "number", description: "Seconds since start" },
              },
            }),
          },
        },
      },
    },

    "/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "List tasks",
        description: "Returns only tasks in your projects plus your own personal tasks.",
        parameters: taskListParams,
        responses: {
          200: {
            description: "A page of tasks.",
            content: json({
              type: "object",
              properties: {
                data: { type: "array", items: ref("Task") },
                meta: ref("PageMeta"),
              },
            }),
          },
          400: errorRef("BadRequest"),
        },
      },
      post: {
        tags: ["Tasks"],
        summary: "Create a task",
        description:
          "A due date in the past is rejected with 400 (UTC date). Updates may set past dates.",
        requestBody: { required: true, content: json(schemaOf(createTaskSchema)) },
        responses: { 201: created("Task"), 400: errorRef("BadRequest") },
      },
    },

    "/tasks/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        tags: ["Tasks"],
        summary: "Get one task",
        responses: { 200: ok("Task"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      patch: {
        tags: ["Tasks"],
        summary: "Update some fields of a task",
        description:
          "Send only the fields to change. `dueDate: null` or `projectId: null` clears the field. Strangers get 404.",
        requestBody: { required: true, content: json(schemaOf(updateTaskSchema)) },
        responses: { 200: ok("Task"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      delete: {
        tags: ["Tasks"],
        summary: "Delete a task and its comments",
        responses: { 204: noContent, 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
    },

    "/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects",
        description: "Only projects you belong to.",
        responses: {
          200: {
            description: "Projects with task counts",
            content: json(listOf("ProjectWithCount")),
          },
        },
      },
      post: {
        tags: ["Projects"],
        summary: "Create a project",
        requestBody: { required: true, content: json(schemaOf(createProjectSchema)) },
        responses: { 201: created("Project"), 400: errorRef("BadRequest") },
      },
    },

    "/projects/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        tags: ["Projects"],
        summary: "Get one project",
        responses: { 200: ok("Project"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      patch: {
        tags: ["Projects"],
        summary: "Update a project",
        description: "Only owners can update a project. Strangers get 404.",
        requestBody: { required: true, content: json(schemaOf(updateProjectSchema)) },
        responses: { 200: ok("Project"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete a project",
        description:
          "Blocked with 409 while tasks still reference the project. Only owners can delete. Strangers get 404.",
        responses: {
          204: noContent,
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
          409: errorRef("Conflict"),
        },
      },
    },

    "/projects/{id}/tasks": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        tags: ["Projects"],
        summary: "List the tasks of one project",
        description: "Strangers get 404.",
        parameters: taskListParams.filter((p) => p.name !== "projectId"),
        responses: {
          200: {
            description: "A page of tasks in this project",
            content: json({
              type: "object",
              properties: { data: { type: "array", items: ref("Task") }, meta: ref("PageMeta") },
            }),
          },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
        },
      },
    },

    "/tasks/{taskId}/comments": {
      parameters: [{ $ref: "#/components/parameters/TaskId" }],
      get: {
        tags: ["Comments"],
        summary: "List comments on a task",
        responses: {
          200: { description: "Comments on this task", content: json(listOf("Comment")) },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
        },
      },
      post: {
        tags: ["Comments"],
        summary: "Add a comment to a task",
        description: "The author is the logged-in user. Strangers get 404.",
        requestBody: { required: true, content: json(schemaOf(createCommentSchema)) },
        responses: {
          201: created("Comment"),
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
        },
      },
    },

    "/tasks/{taskId}/comments/{commentId}": {
      parameters: [
        { $ref: "#/components/parameters/TaskId" },
        { $ref: "#/components/parameters/CommentId" },
      ],
      get: {
        tags: ["Comments"],
        summary: "Get one comment",
        description: "404 if the comment exists but belongs to a different task.",
        responses: { 200: ok("Comment"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      patch: {
        tags: ["Comments"],
        summary: "Edit a comment's text",
        description: "Only the author can edit. Strangers get 404.",
        requestBody: { required: true, content: json(schemaOf(updateCommentSchema)) },
        responses: { 200: ok("Comment"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      delete: {
        tags: ["Comments"],
        summary: "Delete a comment",
        description: "Only the author or a project owner can delete. Strangers get 404.",
        responses: { 204: noContent, 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
    },

    "/projects/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      post: {
        tags: ["Projects"],
        summary: "Duplicate a project and its tasks",
        description:
          "Runs in one transaction. Copied tasks start as `todo`. Only members can duplicate. Strangers get 404.",
        requestBody: { required: false, content: json(schemaOf(duplicateProjectSchema)) },
        responses: {
          201: {
            description: "The new project and how many tasks were copied",
            headers: { Location: { schema: { type: "string" } } },
            content: json({
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: { project: ref("Project"), copiedTasks: { type: "integer" } },
                },
              },
            }),
          },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
        },
      },
    },

    "/projects/{id}/merge": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      post: {
        tags: ["Projects"],
        summary: "Merge this project into another",
        description:
          "Moves every task into the target project and deletes this one. Only owners of both projects can merge. Strangers get 404.",
        requestBody: { required: true, content: json(schemaOf(mergeProjectSchema)) },
        responses: {
          200: {
            description: "The target project and how many tasks moved",
            content: json({
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: { project: ref("Project"), movedTasks: { type: "integer" } },
                },
              },
            }),
          },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
          409: errorRef("Conflict"),
        },
      },
    },

    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account",
        description:
          "Email is trimmed and lowercased. Passwords need 10 to 128 characters and are stored as Argon2id hashes.",
        requestBody: { required: true, content: json(schemaOf(registerSchema)) },
        responses: {
          201: { description: "Account created", content: json(envelope("User")) },
          400: errorRef("BadRequest"),
          409: errorRef("Conflict"),
        },
      },
    },

    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description:
          "Returns a short-lived access token and a refresh token. Every failure returns the same 401 message.",
        requestBody: { required: true, content: json(schemaOf(loginSchema)) },
        responses: {
          200: {
            description: "Logged in",
            content: json({
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                    tokenType: { type: "string", example: "Bearer" },
                    expiresIn: { type: "integer" },
                    refreshExpiresIn: { type: "integer" },
                    user: ref("User"),
                  },
                },
              },
            }),
          },
          400: errorRef("BadRequest"),
          401: errorRef("Unauthorized"),
        },
      },
    },

    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "The logged-in user",
        security: [{ bearerAuth: [] }],
        responses: { 200: ok("User"), 401: errorRef("Unauthorized") },
      },
    },

    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a refresh token for a new token pair",
        description: "Refresh tokens are single-use. Reuse revokes the family.",
        requestBody: { required: true, content: json(schemaOf(refreshSchema)) },
        responses: {
          200: {
            description: "A new token pair",
            content: json({
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    refreshToken: { type: "string" },
                    tokenType: { type: "string" },
                    expiresIn: { type: "integer" },
                    refreshExpiresIn: { type: "integer" },
                    user: ref("User"),
                  },
                },
              },
            }),
          },
          400: errorRef("BadRequest"),
          401: errorRef("Unauthorized"),
        },
      },
    },

    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out this session",
        description: "Revokes the refresh token's family. Always returns 204.",
        requestBody: { required: true, content: json(schemaOf(refreshSchema)) },
        responses: { 204: noContent, 400: errorRef("BadRequest") },
      },
    },

    "/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Log out every session",
        security: [{ bearerAuth: [] }],
        responses: { 204: noContent, 401: errorRef("Unauthorized") },
      },
    },

    "/projects/{id}/members": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        tags: ["Projects"],
        summary: "List the members of a project",
        responses: {
          200: { description: "Members", content: json(listOf("Member")) },
          404: errorRef("NotFound"),
        },
      },
      post: {
        tags: ["Projects"],
        summary: "Add a member by email (owners only)",
        description:
          "Strangers get 404, plain members get 403. 409 if the user is already a member.",
        requestBody: { required: true, content: json(schemaOf(addMemberSchema)) },
        responses: {
          201: { description: "Added", content: json(envelope("Member")) },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
          409: errorRef("Conflict"),
        },
      },
    },

    "/projects/{id}/members/{userId}": {
      parameters: [
        { $ref: "#/components/parameters/Id" },
        { $ref: "#/components/parameters/UserId" },
      ],
      patch: {
        tags: ["Projects"],
        summary: "Change a member's role (owners only)",
        description: "Strangers get 404. 409 if it would leave the project without an owner.",
        requestBody: { required: true, content: json(schemaOf(changeRoleSchema)) },
        responses: {
          200: { description: "Updated", content: json(envelope("Member")) },
          400: errorRef("BadRequest"),
          404: errorRef("NotFound"),
          409: errorRef("Conflict"),
        },
      },
      delete: {
        tags: ["Projects"],
        summary: "Remove a member, or leave the project",
        description:
          "Owners can remove anyone. Anyone can remove themselves. 409 for the last owner.",
        responses: { 204: noContent, 404: errorRef("NotFound"), 409: errorRef("Conflict") },
      },
    },
  },

  components: {
    parameters: {
      Id: { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      TaskId: {
        name: "taskId",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
      CommentId: {
        name: "commentId",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
      UserId: {
        name: "userId",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
    },
    schemas: {
      Task: schemaOf(taskSchema, "output"),
      Project: schemaOf(projectSchema, "output"),
      User: schemaOf(userSchema, "output"),
      ProjectWithCount: {
        allOf: [
          ref("Project"),
          {
            type: "object",
            required: ["taskCount"],
            properties: { taskCount: { type: "integer" } },
          },
        ],
      },
      Comment: schemaOf(commentSchema, "output"),
      PageMeta: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNext: { type: "boolean" },
          hasPrev: { type: "boolean" },
        },
      },
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              details: {
                type: "array",
                description: "Present on validation errors",
                items: {
                  type: "object",
                  properties: { path: { type: "string" }, message: { type: "string" } },
                },
              },
              requestId: { type: "string", description: "Present on 500 errors" },
            },
          },
        },
      },
      Member: {
        type: "object",
        properties: {
          userId: { type: "integer" },
          name: { type: "string" },
          role: { type: "string", enum: [...ROLES] },
          joinedAt: { type: "string" },
        },
      },
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    responses: {
      BadRequest: {
        description:
          "Invalid input (bad JSON, failed validation, or a reference to something that does not exist)",
        content: json(ref("Error")),
      },
      NotFound: {
        description: "The resource or route does not exist",
        content: json(ref("Error")),
      },
      Conflict: {
        description: "The request is valid but conflicts with the current state",
        content: json(ref("Error")),
      },
      Unauthorized: {
        description: "Missing, invalid or expired credentials",
        content: json(ref("Error")),
      },
      Forbidden: {
        description: "You are logged in but not allowed to do this",
        content: json(ref("Error")),
      },
      RateLimited: {
        description:
          "Too many requests. Wait for `retryAfterSeconds` (also sent as a Retry-After header).",
        headers: {
          "Retry-After": {
            schema: { type: "integer" },
            description: "Seconds until the limit resets",
          },
        },
        content: json({
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { message: { type: "string" }, retryAfterSeconds: { type: "integer" } },
            },
          },
        }),
      },
    },
  },
};

const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const PUBLIC_OPS = new Set([
  "GET /health",
  "POST /auth/register",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/logout",
]);
const FORBIDDEN_OPS = new Set([
  "PATCH /tasks/{id}",
  "DELETE /tasks/{id}",
  "PATCH /projects/{id}",
  "DELETE /projects/{id}",
  "POST /projects/{id}/merge",
  "POST /projects/{id}/members",
  "PATCH /projects/{id}/members/{userId}",
  "DELETE /projects/{id}/members/{userId}",
  "PATCH /tasks/{taskId}/comments/{commentId}",
  "DELETE /tasks/{taskId}/comments/{commentId}",
]);

type Operation = { operationId?: string; security?: unknown[]; responses: Record<string, unknown> };

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// GET /tasks/{id}/comments -> getTasksByIdComments. Unique by construction, stable across runs.
function operationIdFor(method: string, path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith("{") ? `By${capitalise(segment.slice(1, -1))}` : capitalise(segment),
    );
  return `${method}${parts.join("")}`;
}

function withSecurity<T extends { paths: object }>(spec: T): T {
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = (item as Record<string, Operation | undefined>)[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      op.operationId ??= operationIdFor(method, path);
      if (PUBLIC_OPS.has(key)) {
        op.security = []; // overrides the global requirement
        continue;
      }
      if (key !== "GET /health") op.responses["429"] ??= errorRef("RateLimited");
      op.responses["401"] ??= errorRef("Unauthorized");
      if (FORBIDDEN_OPS.has(key)) op.responses["403"] ??= errorRef("Forbidden");
    }
  }
  return spec;
}

export const openApiSpec = withSecurity(baseSpec);
