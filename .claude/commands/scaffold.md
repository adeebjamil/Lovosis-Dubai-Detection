---
description: Bootstrap the frontend (Next.js + Volt theme) and backend (Express + Prisma + Admin auth) for this project
argument-hint: "[project-name]"
---

Scaffold the project **$ARGUMENTS** following `.claude/CLAUDE.md`.

Pre-check: read `.claude/docs/project-overview.md`. If it is still PENDING, scaffold ONLY the
shell (stack + Volt layout + Admin Login + empty Overview) — no business modules.

## Backend (`/backend`)
1. `npm init -y`, install packages listed in `.claude/skills/admin-auth/SKILL.md`.
2. `tsconfig.json` (strict, `module: nodenext`, `outDir: dist`), scripts:
   `dev: tsx watch src/server.ts`, `build: tsc`, `start: node dist/server.js`,
   `db:push`, `db:seed: tsx prisma/seed.ts`, `db:setup`.
3. `npx prisma init`; add models from `.claude/docs/admin-auth.md §1`.
4. Create files from `.claude/skills/admin-auth/reference/backend/*`.
5. Write `.env.example` (spec §6) and a `.gitignore` (`node_modules, dist, .env`).

## Frontend (`/frontend`)
1. `npx -y create-next-app@latest frontend --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes`
   (run `--help` first to confirm flags for the installed version).
2. Install packages listed in `.claude/skills/volt-ui/SKILL.md`.
3. Replace `src/app/globals.css` with `.claude/skills/volt-ui/reference/globals.css`.
4. Create from references (`root-layout.tsx` → `app/layout.tsx`, `panel-layout.tsx` →
   `admin/(panel)/layout.tsx`, `overview-page.tsx` → `admin/(panel)/page.tsx`,
   `login-page.tsx` → `admin/login/page.tsx`), plus `components/layout/{Sidebar,Topbar}.tsx`,
   `components/ui/Cards.tsx`, `lib/api.ts`, `store/auth.ts`, `proxy.ts`, `next.config.ts`.
   **Delete the `// @ts-nocheck` first line from every copied file.**
5. `.env.example` with `API_ORIGIN` + `NEXT_PUBLIC_API_URL=/api`.

## Root
- `README.md` with setup steps (DB, env, `npm run db:setup`, `npm run dev` in both).
- `git init` + root `.gitignore`.

## Verify
- `npx tsc --noEmit` passes in both apps.
- Login with seeded admin works; `/admin` redirects to login when logged out.
- Run `/ui-check` on login + overview pages. Report results.
