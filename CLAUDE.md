# jem-sec-attest Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-16

## Active Technologies
- TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `openid-client` v6.x, `iron-session` v8.x, `ai` v6.x (Vercel AI SDK), existing: `zod` v4.x, `yaml` v2.x, `better-sqlite3` v11.x, `safe-stable-stringify`, `dotenv` (002-employee-sso-auth)
- better-sqlite3 (existing adapter) for employees, audit events; iron-session encrypted cookies for sessions (002-employee-sso-auth)
- TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `ai` v6.x (Vercel AI SDK), `zod` v4.x, `better-sqlite3` v11.x, `iron-session` v8.x (003-training-intake)
- SQLite via existing `StorageAdapter` — collection `"role_profiles"` in `records` table (003-training-intake)
- TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `ai` v6.x (Vercel AI SDK), `zod` v4.x, `iron-session` v8.x, `better-sqlite3` v11.x (004-training-workflow)
- SQLite via existing `StorageAdapter` — new collections: `training_sessions`, `training_modules`, `audit_events` (existing) (004-training-workflow)

- TypeScript 5.x (strict mode), Node.js 20+ + `yaml` (parsing), `zod` (validation), `safe-stable-stringify` (deterministic hashing), `better-sqlite3` (local storage), `dotenv` (env loading) (001-multi-tenant-config)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict mode), Node.js 20+: Follow standard conventions

## Recent Changes
- 004-training-workflow: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `ai` v6.x (Vercel AI SDK), `zod` v4.x, `iron-session` v8.x, `better-sqlite3` v11.x
- 003-training-intake: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `ai` v6.x (Vercel AI SDK), `zod` v4.x, `better-sqlite3` v11.x, `iron-session` v8.x
- 002-employee-sso-auth: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `openid-client` v6.x, `iron-session` v8.x, `ai` v6.x (Vercel AI SDK), existing: `zod` v4.x, `yaml` v2.x, `better-sqlite3` v11.x, `safe-stable-stringify`, `dotenv`


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
