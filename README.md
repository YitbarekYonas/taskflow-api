# TaskFlow

A team task-management backend built with Node.js and TypeScript.
Currently a command-line tool; becoming a full REST API with Express and PostgreSQL.

## Features

- Add, list, complete, and delete tasks
- Mark tasks as done
- Set priorities (low / medium / high)
- Set due dates
- List overdue tasks
- Filter tasks by status
- Local JSON storage with schema validation (Zod)
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