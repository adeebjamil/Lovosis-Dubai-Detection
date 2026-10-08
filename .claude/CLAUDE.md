# Project Memory — READ FIRST

> **Status:** 🟢 All Modules Complete: P0 (Auth/DB/Volt Shell) + P1 (Cameras RTSP/WebRTC) + P2 (Realtime YOLOX/ByteTrack Detection & Full View / Custom Zones) + P3 (Detection History & Search) + P4 (Daily & Weekly Reports) + P5 (Offline AI Models & Attire Training Pipeline).
> All features tested, typechecked, and verified via browser walkthrough.

---

## 1. Non-negotiable rules

1. **UI/Theme = Themesberg "Volt" dashboard look, pixel-faithful.**
   Every admin screen must look like Volt (dark navy sidebar, soft-grey body, white cards,
   Nunito Sans, cyan accent). Full spec → [`docs/design-system.md`](docs/design-system.md).
   Reference code → [`skills/volt-ui/reference/`](skills/volt-ui/reference/).
2. **Admin Login is mandatory** and must be built exactly per
   [`docs/admin-auth.md`](docs/admin-auth.md) (JWT in httpOnly cookies, bcrypt, refresh rotation,
   rate-limit + lockout, protected `/admin/*` routes).
3. **Use only design tokens** from `skills/volt-ui/reference/globals.css`.
   No random hex colors, no default Tailwind blues/indigos, no other fonts, no glassmorphism,
   no gradients (Volt is flat).
4. Never commit secrets. `.env` files are git-ignored; ship `.env.example` instead.
5. Before marking any UI task done, run the checklist in
   [`commands/ui-check.md`](commands/ui-check.md) (or the `volt-ui-reviewer` agent).

## 2. Default tech stack (same as our VMS-LOVOSIS project)

| Layer      | Choice                                                                  |
|------------|-------------------------------------------------------------------------|
| Frontend   | Next.js 16 (App Router) + React 19 + TypeScript                         |
| Styling    | Tailwind CSS v4 with Volt tokens (`@theme`) + small component layer     |
| Icons      | FontAwesome Free Solid (`@fortawesome/react-fontawesome`) — matches Volt |
| Charts     | Recharts (smooth `monotone` area/line charts, Volt series colors)       |
| State      | Zustand (auth store, UI store) · Axios (`withCredentials: true`)        |
| Forms      | react-hook-form + zod                                                   |
| Backend    | Node + Express 5 + TypeScript (`tsx watch`)                             |
| DB / ORM   | Prisma 5 + **PostgreSQL 16** (local: `postgres/postgres@localhost:5432/dubai_detection`) |
| Auth       | jsonwebtoken + bcryptjs + cookie-parser + express-rate-limit + helmet   |
| Realtime   | Socket.IO (API → UI), WebSocket (detector → API)                       |
| Detector   | Python 3.12, FastAPI, OpenCV, ONNX Runtime GPU, **YOLOX (Apache-2.0)**, ByteTrack (`supervision`) |
| Streaming  | MediaMTX v1.21 (`/mediamtx`, localhost-only). API registers one path per camera (`cam-001`) via Control API :9997; browser live view = WebRTC through the authenticated WHEP proxy `/api/streams/:id/whep`; detector reads `rtsp://127.0.0.1:8554/cam-001` |

> ⚠️ Licence rule: only MIT / Apache / BSD / CC-BY components. **No Ultralytics (AGPL), no InsightFace models (non-commercial).**

> If the overview demands a different stack (e.g. plain React + Bootstrap 5 like original Volt),
> keep the **visual spec identical** and port the tokens; the design system is framework-agnostic.

## 3. Repo layout (target)

```
/frontend          Next.js app
  src/app/admin/login/page.tsx          ← public login page
  src/app/admin/(panel)/layout.tsx      ← Volt shell: Sidebar + Topbar
  src/app/admin/(panel)/page.tsx        ← Dashboard (Overview)
  src/components/layout/{Sidebar,Topbar}.tsx
  src/components/ui/{Card,StatCard,Button,Badge,Table,...}.tsx
  src/lib/api.ts  src/store/auth.ts  src/proxy.ts (Next 16 route guard)
/backend           Express API
  src/server.ts  src/routes/  src/controllers/  src/middleware/  src/lib/
  prisma/schema.prisma  prisma/seed.ts
/.claude           AI context (this folder)
```

## 4. Where things live in `.claude/`

| Path                                   | Purpose                                        |
|----------------------------------------|------------------------------------------------|
| `docs/project-overview.md`             | Business scope (owner fills this — pending)    |
| `docs/design-system.md`                | Volt visual spec: tokens, layout, components   |
| `docs/admin-auth.md`                   | Admin login: DB model, API, security, UI flow  |
| `skills/volt-ui/`                      | Skill + copy-ready reference code for Volt UI  |
| `skills/admin-auth/`                   | Skill + reference code for the auth module     |
| `commands/scaffold.md`                 | `/scaffold` — bootstrap frontend + backend     |
| `commands/new-page.md`                 | `/new-page` — add an admin page in Volt style  |
| `commands/ui-check.md`                 | `/ui-check` — Volt compliance checklist        |
| `agents/volt-ui-reviewer.md`           | Sub-agent that audits UI against the spec      |
| `settings.json`                        | Tool permissions                               |

## 5. Coding conventions

- TypeScript strict everywhere. No `any` unless justified in a comment.
- Components: PascalCase files, one component per file, props typed with `interface`.
- API responses: `{ success: boolean, data?: T, message?: string, errors?: ZodIssue[] }`.
- Backend layering: route → controller → service → prisma. Validation with zod in controller.
- Dates stored UTC; display in `Asia/Dubai` unless overview says otherwise.
- Every interactive element gets a stable `id` / `data-testid`.
- Communicate with the owner in Hinglish if they write Hinglish; code & docs in English.
