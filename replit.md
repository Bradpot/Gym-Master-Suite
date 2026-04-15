# IronTrack - Gym Management System

## Overview

Full-stack Gym Management Web Application with admin dashboard, member lifecycle management, subscription tracking, and automated notifications.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS
- **File uploads**: multer (stored in `/uploads`)
- **Scheduling**: node-cron (daily 9am expiry notifications)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Features

1. **Dashboard** — Stats cards (total, active, expiring soon, expired), top alerts, notification history
2. **Member Management** — Full CRUD with profile photo upload, auto-generated member IDs (GYM-XXXX)
3. **Search & Filter** — By name, member ID, phone; filter by status
4. **Subscription Logic** — Auto-computes end date; status: active / expiring_soon (≤7 days) / expired
5. **Calendar View** — Highlights expiry dates; click to see expiring members
6. **Notification System** — Manual trigger + daily 9am cron; notification history log
7. **CSV Export** — Download all member data
8. **Dark Mode** — Toggle in top-right corner

## Database Schema

- `members` — member records with subscription info
- `notification_logs` — history of sent/failed notifications

## API Routes

- `GET /api/members` — list with search, filter, pagination, sort
- `POST /api/members` — create (multipart/form-data with optional photo)
- `GET /api/members/:id` — get member
- `PUT /api/members/:id` — update member
- `DELETE /api/members/:id` — delete member
- `GET /api/members/export/csv` — CSV download
- `GET /api/members/calendar/:year/:month` — calendar data
- `GET /api/dashboard/stats` — dashboard summary
- `GET /api/dashboard/expiring-soon` — expiring soon list
- `POST /api/notifications/send` — trigger notifications manually
- `GET /api/notifications/history` — notification log

See the `pnpm-workspace` skill for workspace structure details.
