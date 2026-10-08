---
name: volt-ui
description: Build or modify any admin screen in the Themesberg Volt dashboard style (dark navy sidebar, soft grey body, white cards, Nunito Sans, cyan accent). Use for every frontend/UI task in this project.
---

# Volt UI Skill

## When to use
Any time you create or edit a page, layout, component, modal, table, form, or chart in `frontend/`.

## Steps
1. Read `.claude/docs/design-system.md` (tokens + component specs). It is the source of truth.
2. Ensure `frontend/src/app/globals.css` == `reference/globals.css` (tokens + component layer).
   If missing tokens are needed, add them **there** as Volt-derived values — never inline hex.
3. Reuse/adapt the reference code instead of inventing new patterns:
   | Need                     | Reference file                          |
   |--------------------------|-----------------------------------------|
   | Root layout, font, FA    | `reference/app/root-layout.tsx`         |
   | Protected panel shell    | `reference/app/panel-layout.tsx`        |
   | Overview composition     | `reference/app/overview-page.tsx`       |
   | Login page               | `reference/app/login-page.tsx`          |
   | Sidebar                  | `reference/components/Sidebar.tsx`      |
   | Topbar + logout dropdown | `reference/components/Topbar.tsx`       |
   | Stat card, hero chart    | `reference/components/Cards.tsx`        |

   Reference files start with `// @ts-nocheck` (they live outside any npm project).
   **Always delete that line when copying them into `frontend/` or `backend/`.**
4. Page anatomy (every admin page):
   ```tsx
   <div className="space-y-6">
     {/* header row: title or primary action left, secondary actions right */}
     <div className="flex flex-wrap items-center justify-between gap-3">
       <h1 className="text-2xl">Page title</h1>
       <button className="btn btn-primary btn-sm">…</button>
     </div>
     <div className="card">
       <div className="card-header"><h5 className="card-title">Section</h5></div>
       <div className="card-body">…</div>
     </div>
   </div>
   ```
   Tables: `<div className="card overflow-x-auto"><table className="table-volt">…</table></div>`.
5. Every page needs: loading skeleton, empty state, error alert, and stable `id`s on controls.
6. Finish by running the `/ui-check` checklist.

## Packages
```
npm i @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons @fortawesome/react-fontawesome \
      recharts zustand axios react-hook-form zod @hookform/resolvers clsx
```

## Hard rules
- Colors only via tokens: `bg-primary`, `text-gray-700`, `border-gray-400`, `bg-secondary-alt`,
  `text-success`, etc. No `blue-500`/`slate-*`/arbitrary `[#hex]` values.
- Font = Nunito Sans only. Icons = FontAwesome solid only.
- Radius `.5rem` (`rounded-lg` / `var(--radius-volt)`); no `rounded-2xl+`.
- Flat look: `shadow-volt-sm` on cards; no gradients, blur, glow.
