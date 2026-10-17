# TaskFlow

A team task-management API built with Node.js, Express, and TypeScript.

## Features
- **CLI:** Add, list, start, complete, delete, filter, and export tasks (CSV).
- **HTTP API:** Full CRUD with pagination, sorting, searching, and filtering.
- **Core:** JSON storage with Zod validation, strict TypeScript, and centralized error handling.

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

## API Endpoints

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET | `/health` | Health check | 200 |
| GET | `/tasks` | List tasks (see params below) | 200 |
| GET | `/tasks/:id` | Get one task | 200 |
| POST | `/tasks` | Create a task | 201 |
| PATCH | `/tasks/:id` | Update fields | 200 |
| DELETE | `/tasks/:id` | Delete a task | 204 |

### `GET /tasks` Query Parameters
| Param | Values | Default |
|-------|--------|---------|
| `status` | `todo`, `in_progress`, `done` | all |
| `priority` | `low`, `medium`, `high` | all |
| `search` | text in title | none |
| `sort` | `createdAt`, `dueDate`, `priority`, `title` | `createdAt` |
| `order` | `asc`, `desc` | `asc` |
| `page` / `limit` | integers (limit max 100) | `1` / `10` |

### Sample Response (`GET /tasks`)
```json
{
  "data": [
    { "id": 1, "title": "Write report", "status": "done", "priority": "high" }
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
*Status codes: 400 (Bad Input), 404 (Not Found), 500 (Server Error)*

## Project Structure
```
src/
├── app.ts, server.ts, cli.ts
├── commands.ts (Service layer), storage.ts (JSON data)
├── config.ts, logger.ts, errors.ts, types.ts, utils.ts
├── schemas/ (Zod validation)
├── middleware/ (Logger, error handling)
├── controllers/ (HTTP logic)
└── routes/ (Express routes)
```

## Tech Stack
Node.js, TypeScript, Express 5, Zod, dotenv, tsx.

## Roadmap
- [x] Week 1 — CLI core
- [x] Week 2 — Express API (CRUD, pagination, filtering)
- [ ] Week 3 — PostgreSQL
- [ ] Week 4 — Auth (JWT)

## Known Limitations
**Concurrency:** JSON file storage is not safe for concurrent writes (causes lost updates). A real database with transactions will fix this in Week 3.