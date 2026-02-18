# jem-sec-attest Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-16

## Active Technologies
- TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `openid-client` v6.x, `iron-session` v8.x, `ai` v6.x (Vercel AI SDK), existing: `zod` v4.x, `yaml` v2.x, `better-sqlite3` v11.x, `safe-stable-stringify`, `dotenv` (002-employee-sso-auth)
- better-sqlite3 (existing adapter) for employees, audit events; iron-session encrypted cookies for sessions (002-employee-sso-auth)

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
- 002-employee-sso-auth: Added TypeScript 5.9 (strict mode), Node.js 20.9+ + Next.js 16.x (App Router), React 19.x, `openid-client` v6.x, `iron-session` v8.x, `ai` v6.x (Vercel AI SDK), existing: `zod` v4.x, `yaml` v2.x, `better-sqlite3` v11.x, `safe-stable-stringify`, `dotenv`

- 001-multi-tenant-config: Added TypeScript 5.x (strict mode), Node.js 20+ + `yaml` (parsing), `zod` (validation), `safe-stable-stringify` (deterministic hashing), `better-sqlite3` (local storage), `dotenv` (env loading)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
