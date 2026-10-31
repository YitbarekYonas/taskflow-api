import { z } from "zod";
import { createCommentSchema, updateCommentSchema } from "../schemas/comment.schemas.js";
import { createProjectSchema, duplicateProjectSchema, mergeProjectSchema, updateProjectSchema } from "../schemas/project.schemas.js";
import { SORT_FIELDS, createTaskSchema, updateTaskSchema } from "../schemas/task.schemas.js";
import { PRIORITIES, STATUSES, commentSchema, projectSchema, taskSchema,userSchema } from "../types.js";
import { registerSchema } from "../schemas/auth.schemas.js";
import {loginSchema,refreshSchema} from "../schemas/auth.schemas.js";

function schemaOf(schema: z.ZodType, io: "input" | "output" = "input") {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io }) as Record<string, unknown>;
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
const errorRef = (name:"BadRequest" | "NotFound" | "Conflict" | "Unauthorized" | "Forbidden") => ({
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

// Extracted so we can reuse it for the nested project tasks route
const taskListParams = [
  query("status", { type: "string", enum: [...STATUSES] }),
  query("priority", { type: "string", enum: [...PRIORITIES] }),
  query("projectId", { type: "integer", minimum: 1 }),
  query("search", { type: "string" }, "Case-insensitive match on the title"),
  query("sort", { type: "string", enum: [...SORT_FIELDS], default: "createdAt" },
    "Tasks without a due date always sort last"),
  query("order", { type: "string", enum: ["asc", "desc"], default: "asc" }),
  query("page", { type: "integer", minimum: 1, default: 1 }),
  query("limit", { type: "integer", minimum: 1, maximum: 100, default: 10 }),
];

export const baseSpec = {
  openapi: "3.1.0",
  info: {
    title: "TaskFlow API",
    version: "0.3.0",
    description:
      "A task-management API built with Node.js, Express and TypeScript.\n\n" +
      "All errors share one shape: `{ \"error\": { \"message\": \"...\" } }`. " +
      "Validation errors add a `details` array, and unexpected 500s include a `requestId`.",
    license: { name: "MIT" },
  },
  security: [{ bearerAuth: [] }],
  servers: [{ url: "/" }],
  tags: [
    { name: "System" },
    { name: "Auth" },
    { name: "Tasks" },
    { name: "Projects" },
    { name: "Comments" },
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
        description: "Filtering happens first, then sorting, then pagination.",
        parameters: taskListParams,
        responses: {
          200: {
            description: "A page of tasks. A page past the end is still 200 with an empty list.",
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
        description: "Send only the fields to change. `dueDate: null` or `projectId: null` clears the field.",
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
        responses: { 200: { description: "All projects with task counts", content: json(listOf("ProjectWithCount")) } },
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
        requestBody: { required: true, content: json(schemaOf(updateProjectSchema)) },
        responses: { 200: ok("Project"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete a project",
        description: "Blocked with 409 while tasks still reference the project (enforced by a database foreign key).",
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
        description: "Same filters, sorting and pagination as `GET /tasks`, without `projectId`.",
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
          "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create an account",
        description:
          "Email is trimmed and lowercased. Passwords need 10 to 128 characters and are stored as Argon2id hashes. " +
          "The response never contains the password or its hash.",
        requestBody: { required: true, content: json(schemaOf(registerSchema)) },
        responses: {
          201: { description: "Account created", content: json(envelope("User")) },
          400: errorRef("BadRequest"),
          409: errorRef("Conflict"),
        },
      },
    },
      post: {
        tags: ["Comments"],
        summary: "Add a comment to a task",
        requestBody: { required: true, content: json(schemaOf(createCommentSchema)) },
        responses: { 201: created("Comment"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
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
        requestBody: { required: true, content: json(schemaOf(updateCommentSchema)) },
        responses: { 200: ok("Comment"), 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
      delete: {
        tags: ["Comments"],
        summary: "Delete a comment",
        responses: { 204: noContent, 400: errorRef("BadRequest"), 404: errorRef("NotFound") },
      },
    },    "/projects/{id}/duplicate": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      post: {
        tags: ["Projects"],
        summary: "Duplicate a project and its tasks",
        description: "Runs in one transaction. Copied tasks start as `todo`. The body is optional.",
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
          "Moves every task into the target project and deletes this one, in one transaction. " +
          "409 if tasks were added to this project while the merge was running.",
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
        "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description:
          "Returns a short-lived access token. Every failure returns the same 401 message " +
          "(\"Invalid email or password.\") so the response never reveals whether an email exists.",
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
                    refreshExpiresIn: { type: "integer", description: "Seconds until the refresh token expires" },
                    tokenType: { type: "string", example: "Bearer" },
                    expiresIn: { type: "integer", description: "Seconds until the token expires" },
                    user: ref("User"),
                    refreshToken: { type: "string" }
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
        description:
          "Refresh tokens are single-use. Each call returns a NEW refresh token that replaces the old one. " +
          "Presenting an already-used token revokes the whole session family (theft detection).",
        requestBody: { required: true, content: json(schemaOf(refreshSchema)) },
        responses: {
          200: {
            description: "A new access token and a new refresh token",
            content: json({
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    accessToken: { type: "string" },
                    tokenType: { type: "string", example: "Bearer" },
                    expiresIn: { type: "integer" },
                    refreshToken: { type: "string" },
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
        description:
          "Revokes the refresh token's whole family. Always returns 204, even for unknown tokens, so the " +
          "endpoint reveals nothing. An access token that was already issued stays valid until it expires.",
        requestBody: { required: true, content: json(schemaOf(refreshSchema)) },
        responses: { 204: noContent, 400: errorRef("BadRequest") },
      },
    },

    "/auth/logout-all": {
      post: {
        tags: ["Auth"],
        summary: "Log out every session of the current user",
        security: [{ bearerAuth: [] }],
        responses: { 204: noContent, 401: errorRef("Unauthorized") },
      },
    },
  },

  components: {
    parameters: {
      Id: { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      TaskId: { name: "taskId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
      CommentId: { name: "commentId", in: "path", required: true, schema: { type: "integer", minimum: 1 } },
    },
    schemas: {
      Task: schemaOf(taskSchema, "output"),
      Project: schemaOf(projectSchema, "output"),
      User: schemaOf(userSchema, "output"), 
      ProjectWithCount: {
        allOf: [
          ref("Project"),
          { type: "object", required: ["taskCount"], properties: { taskCount: { type: "integer" } } },
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
    },
    responses: {
      BadRequest: {
        description: "Invalid input (bad JSON, failed validation, or a reference to something that does not exist)",
        content: json(ref("Error")),
      },
      NotFound: { description: "The resource or route does not exist", content: json(ref("Error")) },
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
    },
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};
const METHODS = ["get", "post", "put", "patch", "delete"] as const;
const PUBLIC_OPS = new Set(["GET /health", "POST /auth/register", "POST /auth/login","POST /auth/refresh" , "POST /auth/logout"]);
const FORBIDDEN_OPS = new Set([
  "PATCH /tasks/{id}",
  "DELETE /tasks/{id}",
  "PATCH /projects/{id}",
  "DELETE /projects/{id}",
  "POST /projects/{id}/merge",
]);

type Operation = { security?: unknown[]; responses: Record<string, unknown> };

function withSecurity<T extends { paths: object }>(spec: T): T {
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = (item as Record<string, Operation | undefined>)[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (PUBLIC_OPS.has(key)) {
        op.security = []; // overrides the global requirement
        continue;
      }
      op.responses["401"] ??= errorRef("Unauthorized");
      if (FORBIDDEN_OPS.has(key)) op.responses["403"] ??= errorRef("Forbidden");
    }
  }
  return spec;
}

export const openApiSpec = withSecurity(baseSpec);