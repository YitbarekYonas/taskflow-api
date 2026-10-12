# TaskFlow

A team task-management CLI built with Node.js and TypeScript.
Week 1 delivers the command-line core; Week 2+ turns it into a full REST API with Express and PostgreSQL.

## Features

- Add, list, complete, and delete tasks
- Start tasks (move to `in_progress`)
- Set priorities (low / medium / high)
- Set due dates
- Filter tasks by status
- List overdue tasks
- Summary of task counts by status
- CSV export
- Local JSON storage with schema validation (Zod)
- Config via `.env`
- Type-safe codebase with strict TypeScript

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