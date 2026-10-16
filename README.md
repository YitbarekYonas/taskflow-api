# TaskFlow

A team task-management API built with Node.js, Express, and TypeScript.
The CLI remains for local use; the HTTP API is the primary interface and will grow into a full backend with PostgreSQL and authentication.

## Features

### CLI
- Add, list, start, complete, and delete tasks
- Set priorities (low / medium / high) and due dates
- Filter tasks by status
- List overdue tasks
- Summary of task counts by status
- CSV export

### HTTP API
- `GET /health` — server health check
- `GET /tasks` — list tasks (optional `?status=`)
- `GET /tasks/:id` — get a task by id
- `POST /tasks` — create a task
- `PATCH /tasks/:id` — partially update a task
- `DELETE /tasks/:id` — delete a task

### Shared
- Local JSON storage with Zod validation
- Type-safe codebase with strict TypeScript
- Config via `.env`
- Centralized error handling with consistent JSON error shape

## Setup

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm

### Install

```bash

git clone https://github.com/YitbarekYonas/taskflow-api.git
cd taskflow-api
npm install
cp .env.example .env