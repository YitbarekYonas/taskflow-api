# TaskFlow

A team task-management API built with Node.js, Express, and TypeScript.

## Features
- **CLI:** Add, list, start, complete, delete, filter, and export tasks (CSV).
- **HTTP API:** Full CRUD for tasks, projects, and comments, with pagination, sorting, searching, filtering, and referential integrity.
- **Core:** Repository pattern (swappable JSON storage), Zod validation, strict TypeScript, and centralized error handling.
- **Production Middleware:** Security headers (Helmet), CORS, Request IDs, and body size limits.

## Setup
```bash
git clone https://github.com/YitbarekYonas/taskflow-api.git
cd taskflow-api
npm install
cp .env.example .env
npm run typecheck
```

## Development
```bash
npm run dev     # Run API with auto-restart (http://localhost:3000)
npm run cli -- list  # Run CLI
npm run build   # Build for production
npm start       # Run compiled JS
```

## Documentation & Testing

Interactive API docs are available at `http://localhost:3000/docs` when the server is running. You can test every endpoint directly in the browser.

To verify the API against a running server:
```bash
npm run smoke
```
*(The server must be running in another terminal).*

## API Endpoints

### Tasks
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/tasks` | List tasks (see params below) | 200 |
| GET | `/tasks/:id` | Get one task | 200 |
| POST | `/tasks` | Create a task | 201 |
| PATCH | `/tasks/:id` | Update fields | 200 |
| DELETE | `/tasks/:id` | Delete a task | 204 |

### Projects
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/projects` | List all projects | 200 |
| GET | `/projects/:id` | Get one project | 200 |
| POST | `/projects` | Create a project | 201 |
| PATCH | `/projects/:id` | Update a project | 200 |
| DELETE | `/projects/:id` | Delete a project (fails with 409 if it has tasks) | 204 |

### Comments
| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/tasks/:taskId/comments` | List comments for a task | 200 |
| POST | `/tasks/:taskId/comments` | Create a comment | 201 |
| GET | `/tasks/:taskId/comments/:commentId` | Get one comment | 200 |
| PATCH | `/tasks/:taskId/comments/:commentId` | Update a comment | 200 |
| DELETE | `/tasks/:taskId/comments/:commentId` | Delete a comment | 204 |

### `GET /tasks` Query Parameters
| Param | Values | Default |
|-------|--------|---------|
| `status` | `todo`, `in_progress`, `done` | all |
| `priority` | `low`, `medium`, `high` | all |
| `projectId` | integer (e.g., `1`) | all |
| `search` | text in title | none |
| `sort` | `createdAt`, `dueDate`, `priority`, `title` | `createdAt` |
| `order` | `asc`, `desc` | `asc` |
| `page` / `limit` | integers (limit max 100) | `1` / `10` |

### Sample Response (`GET /tasks`)
```json
{
  "data": [
    { "id": 1, "title": "Write report", "status": "done", "priority": "high", "projectId": 1 }
  ],
  "meta": { "page": 1, "limit": 10, "total": 13, "totalPages": 2, "hasNext": true, "hasPrev": false }
}
```

### Error Response
```json
{
  "error": { "message": "Validation failed", "details": [{ "path": "title", "message": "Required" }] }
}
```
*Status codes: 400 (Bad Input), 404 (Not Found), 409 (Conflict), 413 (Payload Too Large), 500 (Server Error)*

## Architecture

```
HTTP request -> route (validate) -> controller -> service -> repository -> JSON file
```

The repository pattern decouples business logic from data storage. Services depend on a `Repository<T>` interface, not a specific implementation. To move from JSON files to PostgreSQL (Week 3), we only need to create a new repository class and update the composition root (`container.ts`).

## Production Middleware

- **Helmet:** Sets security-related HTTP headers (e.g., `X-Content-Type-Options`, `Content-Security-Policy`).
- **CORS:** Restricts browser requests to allowed origins (`CORS_ORIGIN` in `.env`).
- **Request IDs:** Each request gets an `X-Request-Id` header, echoed back and included in logs for tracing.
- **Body Limit:** JSON payloads are capped at 100kb to prevent abuse (returns `413 Payload Too Large`).

## Project Structure
```
src/
├── app.ts, server.ts, cli.ts
├── container.ts (Composition root)
├── config.ts, logger.ts, errors.ts, types.ts, utils.ts
├── docs/ (OpenAPI spec)
├── schemas/ (Zod validation)
├── repositories/ (Data storage: interface, JSON impl, legacy migration)
├── services/ (Business logic: tasks, projects, comments, queries)
├── middleware/ (Logger, validation, error handling, request IDs)
├── controllers/ (HTTP logic)
└── routes/ (Express routes)
```

## Tech Stack
Node.js, TypeScript, Express 5, Zod, dotenv, tsx, Helmet, CORS, Swagger UI.

## Roadmap
- [x] Week 1 — CLI core
- [x] Week 2 — Express API (CRUD, pagination, filtering, repository pattern, projects, comments, production middleware, OpenAPI docs)
- [ ] Week 3 — PostgreSQL
- [ ] Week 4 — Auth (JWT)

## Known Limitations
1. **Concurrency:** JSON file storage is safe for concurrent requests *within the same Node process* (thanks to an in-memory write queue), but not across multiple processes. A real database with transactions will fix this in Week 3.
2. **Cascading Deletes:** Deleting a task deletes its comments in two separate steps. A crash between them leaves orphaned comments. A database transaction will fix this.
3. **Unauthenticated Authors:** Comment authors are supplied by the client as plain strings. This will be replaced by authenticated user IDs in Week 4.
