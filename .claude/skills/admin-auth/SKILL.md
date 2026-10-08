---
name: admin-auth
description: Implement, modify or debug the Admin Login / session system (Express + Prisma + JWT httpOnly cookies with refresh rotation, Next.js proxy guard, Zustand auth store). Use for anything touching login, logout, sessions, roles, or protected routes.
---

# Admin Auth Skill

## Steps
1. Read `.claude/docs/admin-auth.md` — contract, security rules, acceptance checklist.
2. Backend — copy & adapt from `reference/backend/`:
   | Target file                          | Reference                         |
   |--------------------------------------|-----------------------------------|
   | `prisma/schema.prisma`               | spec §1 (`Admin`, `RefreshToken`) |
   | `src/lib/tokens.ts`                  | `tokens.ts`                       |
   | `src/middleware/auth.ts`             | `auth.middleware.ts`              |
   | `src/controllers/auth.controller.ts` | `auth.controller.ts`              |
   | `src/routes/auth.routes.ts`, `src/server.ts`, `src/lib/prisma.ts`, `prisma/seed.ts` | `routes-server-seed.ts` |
3. Frontend — copy & adapt from `reference/frontend/api-store-proxy.ts`:
   `src/lib/api.ts`, `src/store/auth.ts`, `src/proxy.ts`, `next.config.ts`.
   Login page UI → `../volt-ui/reference/app/login-page.tsx`.
   **Delete the `// @ts-nocheck` first line from every file you copy.**
4. Backend packages:
   ```
   npm i express cors helmet cookie-parser jsonwebtoken bcryptjs zod express-rate-limit @prisma/client dotenv
   npm i -D prisma tsx typescript @types/express @types/cors @types/cookie-parser @types/jsonwebtoken @types/node
   ```
5. Verify every item of the acceptance checklist (spec §8) before reporting done.

## Never
- Store tokens in localStorage / return them in JSON.
- Reveal whether an email exists.
- Log passwords, hashes, or raw tokens.
- Allow open redirects via `?next=` (must start with `/admin`).
