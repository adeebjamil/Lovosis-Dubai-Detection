---
description: Create a new protected admin page (route + sidebar entry + API wiring) in Volt style
argument-hint: "<PageName> [route] [fa-icon]"
---

Create admin page **$ARGUMENTS**.

1. Load the `volt-ui` skill and read `.claude/docs/design-system.md`.
2. Route: `frontend/src/app/admin/(panel)/<route>/page.tsx` (default route = kebab-case name).
3. Add the item to `NAV_MAIN` in `components/layout/Sidebar.tsx` (FontAwesome solid icon).
   Also update the sidebar table in `.claude/docs/project-overview.md §4`.
4. Page anatomy: header row (h1 + primary action) → content cards → tables in `.card` +
   `.table-volt`. Include loading skeleton, empty state, error alert.
5. Data: create `frontend/src/services/<name>.ts` using `api` from `@/lib/api`.
   If backend endpoints are needed, add `routes/ → controllers/ → services/` protected by
   `requireAuth` (and `requireRole` when admin-only).
6. Forms: react-hook-form + zod, `.form-label` / `.form-control` / `.invalid-feedback`.
7. Set `export const metadata`-equivalent title via a server wrapper or `document.title`.
8. Run `/ui-check` on the new page before finishing.
