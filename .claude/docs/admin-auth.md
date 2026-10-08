# Admin Login & Auth — Spec (MANDATORY)

Admin-only panel. No public signup. First admin is created by the seed script from env vars.

---

## 1. Data model (Prisma)

```prisma
enum AdminRole {
  SUPER_ADMIN
  ADMIN
}

model Admin {
  id                  String         @id @default(uuid())
  name                String
  email               String         @unique
  passwordHash        String
  role                AdminRole      @default(ADMIN)
  avatarUrl           String?
  isActive            Boolean        @default(true)
  failedLoginAttempts Int            @default(0)
  lockedUntil         DateTime?
  lastLoginAt         DateTime?
  lastLoginIp         String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  refreshTokens       RefreshToken[]
}

model RefreshToken {
  id         String    @id @default(uuid())
  adminId    String
  admin      Admin     @relation(fields: [adminId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique          // sha256 of the raw token, never store raw
  userAgent  String?
  ip         String?
  expiresAt  DateTime
  revokedAt  DateTime?
  replacedBy String?                    // id of the token that rotated this one
  createdAt  DateTime  @default(now())

  @@index([adminId])
}
```

## 2. Tokens & cookies

| Item          | Value                                                                      |
|---------------|----------------------------------------------------------------------------|
| Access token  | JWT HS256, payload `{ sub, role, email }`, TTL **15 min**, `JWT_ACCESS_SECRET` |
| Refresh token | 64-byte random (crypto), TTL **7 days** (30 days if "Remember me"), stored hashed |
| Cookie names  | `admin_at` (access, path `/`), `admin_rt` (refresh, path `/api/auth`), `admin_session` (`"1"` flag, path `/`, same expiry as RT — lets the Next proxy know a session exists after the 15-min access cookie is gone) |
| Cookie flags  | `httpOnly`, `secure` in production, `sameSite: 'lax'`, optional `domain: COOKIE_DOMAIN` |
| Same origin   | Frontend calls `/api/*`; `next.config.ts` rewrites it to the Express server, so cookies are first-party and visible to the proxy |
| Rotation      | Every `/refresh` revokes old RT and issues a new pair. **Reuse of a revoked RT ⇒ revoke all RTs of that admin** (token theft detection). |

Tokens are **never** put in localStorage or response bodies.

## 3. API (prefix `/api/auth`)

| Method | Path               | Auth     | Body                                   | Result |
|--------|--------------------|----------|----------------------------------------|--------|
| POST   | `/login`           | public   | `{ email, password, remember?: bool }` | sets cookies, returns `{ admin }` (no hash) |
| POST   | `/refresh`         | RT cookie| —                                      | rotates, sets cookies, `{ admin }` |
| POST   | `/logout`          | any      | —                                      | revokes current RT, clears cookies |
| POST   | `/logout-all`      | access   | —                                      | revokes all RTs of the admin |
| GET    | `/me`              | access   | —                                      | `{ admin }` |
| POST   | `/change-password` | access   | `{ currentPassword, newPassword }`     | revokes all other sessions |

Validation (zod): email valid & lowercased/trimmed; password 8–128 chars.
New password policy: ≥8 chars, at least 1 letter + 1 number.

### Login algorithm
1. Validate body. Find admin by email.
2. If not found → `bcrypt.compare` against a dummy hash (timing-safe) → **401 "Invalid email or password"**.
3. If `!isActive` → 403 "Account disabled".
4. If `lockedUntil > now` → 423 "Too many attempts. Try again in N minutes."
5. Compare password (bcrypt cost **12**). Wrong → `failedLoginAttempts++`; at **5** set
   `lockedUntil = now + 15 min` and reset counter → 401 (same generic message).
6. Success → reset counter, set `lastLoginAt/lastLoginIp`, create RT row, set cookies, 200.

## 4. Middleware

- `requireAuth` — reads `admin_at` cookie (fallback `Authorization: Bearer`), verifies JWT,
  loads admin (must be active), attaches `req.admin`. 401 `{ code: 'TOKEN_EXPIRED' }` when expired.
- `requireRole(...roles)` — 403 if `req.admin.role` not in roles.
- Global: `helmet()`, `cors({ origin: CORS_ORIGINS.split(','), credentials: true })`,
  `cookieParser()`, `express.json({ limit: '1mb' })`.
- `express-rate-limit` on `/api/auth/login`: **10 req / 15 min / IP**; on `/refresh`: 60 / 15 min.

## 5. Seed

`prisma/seed.ts` upserts a `SUPER_ADMIN` from `ADMIN_SEED_NAME`, `ADMIN_SEED_EMAIL`,
`ADMIN_SEED_PASSWORD`. Refuse to run if password is missing or < 8 chars. Never log the password.

## 6. Env (`backend/.env.example`)

```
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_db
JWT_ACCESS_SECRET=change-me-64-random-chars
JWT_ACCESS_TTL=15m
REFRESH_TTL_DAYS=7
REFRESH_REMEMBER_TTL_DAYS=30
CORS_ORIGINS=http://localhost:3000
COOKIE_DOMAIN=
ADMIN_SEED_NAME=Super Admin
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=ChangeMe@123
```

`frontend/.env.example`:
```
API_ORIGIN=http://localhost:5000     # used by next.config rewrites
NEXT_PUBLIC_API_URL=/api             # keep same-origin
```

## 7. Frontend flow

- **Routes:** `/admin/login` (public), everything else under `/admin/*` protected.
  `/` redirects to `/admin`.
- **`src/proxy.ts`** (Next 16 name for middleware): for `/admin/*` except `/admin/login`, if the
  `admin_session` cookie is missing → redirect to `/admin/login?next=<path>`.
  It never redirects *away* from the login page (prevents redirect loops with stale cookies).
  (Proxy only checks presence — real verification is `/auth/me` on the API.)
- **`store/auth.ts`** (Zustand): `{ admin, status: 'idle'|'loading'|'authenticated'|'guest', login, logout, fetchMe }`.
- **`lib/api.ts`** (Axios): `baseURL = NEXT_PUBLIC_API_URL`, `withCredentials: true`.
  Response interceptor: on **any 401** (except `/auth/login|refresh|logout`) → single-flight
  `POST /auth/refresh` → retry original once (a 409 `REFRESH_RACE` also means "just retry").
  Note: the browser deletes `admin_at` after 15 min, so the API returns `NO_TOKEN`, not `TOKEN_EXPIRED`.
  If refresh fails → clear store → `router.replace('/admin/login')`.
- **Panel layout** calls `fetchMe()` on mount, shows a full-page Volt skeleton while loading.
- **Login page** UI per design-system §6. On success → `router.replace(next ?? '/admin')`.
  Show server message in the error alert. Disable button while submitting. Autofocus email.
- **Logout**: Topbar avatar dropdown → `POST /auth/logout` → clear store → `/admin/login`.
- **Profile page** (`/admin/profile`): name, email (read-only), avatar, change-password form.

## 8. Acceptance checklist
- [ ] Wrong email and wrong password show the *same* message.
- [ ] 5 wrong passwords lock the account for 15 min (423 with minutes left).
- [ ] Cookies are httpOnly; nothing auth-related in localStorage.
- [ ] Access token expiry silently refreshes; user is not kicked out within 7 days.
- [ ] Reusing an old refresh token kills all sessions.
- [ ] Visiting `/admin` logged-out redirects to `/admin/login?next=/admin`.
- [ ] Logout clears cookies and back-button does not show panel data.
- [ ] Login page visually matches Volt "Sign in" page (design-system §6).
