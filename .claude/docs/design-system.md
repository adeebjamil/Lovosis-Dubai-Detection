# Design System — "Volt" Admin Theme (MANDATORY)

Source of truth: Themesberg **Volt React Dashboard** (React + Bootstrap 5).
Tokens below are copied from Volt's `src/scss/volt/_variables.scss`. Do not deviate.
Live reference: https://demo.themesberg.com/volt-react-dashboard/

---

## 1. Color tokens

### Brand / theme
| Token            | Hex       | Use                                                    |
|------------------|-----------|--------------------------------------------------------|
| `primary`        | `#262B40` | Sidebar bg, primary buttons, headings, active toggles  |
| `primary-active` | `#2E3650` | Active sidebar item bg, hover on dark surfaces         |
| `indigo`         | `#4C5680` | Active sidebar item border, sidebar divider            |
| `secondary`      | `#61DAFB` | Accent: "Pro" badges, "See all" buttons, active pills  |
| `secondary-alt`  | `#B5EEFD` | Hero chart card background (light cyan)                |
| `tertiary`       | `#1B998B` | Donut/progress accent, icon tints                      |
| `quaternary`     | `#C96480` | Extra chart series                                     |
| `chart-line`     | `#17A5CE` | Main line/area stroke on the cyan hero card            |

### Status
| Token     | Hex       |
|-----------|-----------|
| `success` | `#05A677` |
| `info`    | `#0948B3` |
| `warning` | `#F5B759` |
| `danger`  | `#FA5252` |

### Greys (Volt scale — note 100/200/300 are all near-white)
| Token      | Hex       | Use                                         |
|------------|-----------|---------------------------------------------|
| `gray-100` | `#F3F7FA` |                                             |
| `gray-200` | `#F5F8FB` | **Body background**, table header bg        |
| `gray-300` | `#F0F3F6` | Hover bg on light surfaces                  |
| `gray-400` | `#EAEDF2` | **Card & table borders**                    |
| `gray-500` | `#D1D7E0` | **Input / outline-button borders**          |
| `gray-600` | `#93A5BE` | Placeholder text, disabled                  |
| `gray-700` | `#66799E` | Muted/small text ("Feb 1 - Apr 1")          |
| `gray-800` | `#506690` | Secondary text                              |
| `gray-900` | `#4A5073` | **Default body text**                       |
| `black`    | `#2E3650` | Shadow base color                           |

### Chart series order
`#1B998B, #17A5CE, #262B40, #F5B759, #C96480`

## 2. Typography
- Font: **Nunito Sans** (Google Fonts) weights 300/400/600/700/800. Load via `next/font/google`.
- Base: `1rem` / line-height `1.5` / color `gray-900` / weight 400.
- Headings: weight **600**, color `primary` (#262B40).
  - Page title h1: `1.5rem–1.75rem`
  - Card title h5: `1.125rem` weight 600 (e.g. "Sales Value", "Customers")
  - Big metric h3: `1.75rem` weight **700** (e.g. "$10,567", "345k")
- Small/meta text: `0.875rem` (`small`) color `gray-700`.
- Sidebar & buttons: `0.875rem`, buttons weight 600.
- Table header: `0.75rem`, uppercase, weight 700, letter-spacing `.025em`.

## 3. Shape, spacing, elevation
- Radius: **0.5rem** for cards, buttons, inputs, sidebar items. Pills `2rem`. Avatars 50%.
- Borders: `1px` (`0.0625rem`) solid `gray-400` on cards; `gray-500` on inputs.
- Shadows:
  - `shadow-volt-sm`: `0 2px 18px rgba(0,0,0,.02)` → cards (almost flat)
  - `shadow-volt`: `0 .5rem 1rem rgba(46,54,80,.15)` → dropdowns, login card
  - `shadow-volt-lg`: `0 1rem 3rem rgba(46,54,80,.175)` → modals
- Spacing: Bootstrap 1rem scale. Card body padding `1.5rem`. Grid gutter `1.5rem`.
  Main content padding `1.5rem 2rem` (desktop), `1rem` (mobile).
- **No gradients, no glassmorphism, no neon.** Volt is flat, calm, high-whitespace.

## 4. Layout shell

```
┌───────────────┬────────────────────────────────────────────────┐
│  SIDEBAR      │ TOPBAR  [🔍 Search........]        🔔•  (◉) Name │
│  260px        ├────────────────────────────────────────────────┤
│  bg #262B40   │ [+ New Task]                     [Share|Export] │
│               │ ┌────────────── HERO CHART CARD ─────────────┐ │
│  ◆ Brand      │ │ bg secondary-alt · title · big value · trend│ │
│  ▣ Overview ← │ │ Month/Week pill toggle (top-right)          │ │
│  ✉ Messages Pro│ │ smooth area chart stroke #17A5CE           │ │
│  ...          │ └────────────────────────────────────────────┘ │
│  ───────────  │ ┌ StatCard ┐ ┌ StatCard ┐ ┌ Donut card ┐         │
│  ▸ Settings   │ └──────────┘ └──────────┘ └────────────┘         │
│               │ ┌ Table card (Page visits) ┐ ┌ Side card ┐       │
└───────────────┴────────────────────────────────────────────────┘
body bg = gray-200 (#F5F8FB)
```

### Sidebar
- Fixed left, width **260px**, full height, bg `primary`, text white. Collapses to off-canvas
  drawer below `lg` (992px) with a hamburger in the topbar and a dark overlay.
- Brand row on top: logo (20–24px) + app name, `0.875rem`, weight 600, padding `1rem .75rem`.
- Nav item: flex, gap `.75rem`, padding `.55rem .75rem`, radius `.5rem`, margin-bottom `.2rem`,
  font `0.875rem`, icon 14–16px, border `1px solid transparent`, color `rgba(255,255,255,.9)`.
  - Hover: bg `primary-active`.
  - **Active:** bg `primary-active` + border `1px solid indigo` + text white.
  - Badge ("Pro"/count): pill, bg `secondary`, text `primary`, `0.65rem`, weight 700, right-aligned.
  - Collapsible group: chevron right `›` rotates 90° when open; children indented `2rem`.
- Divider: `border-top: 1px solid #4C5680`, margin `1rem 0`.

### Topbar
- Sits on body bg (no white bar), height ~`4rem`, padding `1rem 0`.
- Left: search input (max-width 300px) with magnifier icon inside, white bg, border `gray-500`.
- Right: bell icon (`primary`) with 8px red dot (`danger`) when unread; then avatar 32px circle +
  name (`0.875rem`, weight 600, `primary`). Avatar opens dropdown: My Profile, Settings,
  divider, **Logout** (text `danger`).

### Page header row
- Left: primary button with icon (`+ New Task`). Right: outline button group (`Share | Export`).

## 5. Components

| Component        | Spec |
|------------------|------|
| **Card**         | bg white, border `gray-400`, radius .5rem, `shadow-volt-sm`, body padding 1.5rem. Header (optional): padding `1.25rem 1.5rem`, bottom border `gray-400`, title h5 + action on right. |
| **Hero chart card** | Same as card but bg `secondary-alt`, no border. Title h5 weight 400 `primary`, value h3 700, below: `small` "Yesterday" + green `▲ 10.57%`. Pill toggle top-right: active = bg `primary` white text; inactive = bg `secondary` primary text; `btn-sm`. Chart: Recharts `AreaChart`, `type="monotone"`, stroke `#17A5CE` 2px, fill same @ 15% opacity, dots r=4 filled stroke color, vertical grid lines only (`#17A5CE` @ 25%), no horizontal grid, axis labels `0.75rem` weight 600 `primary`. |
| **StatCard**     | Card with 2 cols: left icon-shape (48px square, icon 1.5rem color `primary` or tinted bg like `rgba(27,153,139,.1)` + `tertiary` icon); right: title h5 (600), value h3 (700), `small` meta line gray-700, trend line (`success` ▲ / `danger` ▼ + "Since last month"). |
| **Donut card**   | Recharts `PieChart` innerRadius 60% using series colors; legend on right with small icons + `Desktop 60%` text. |
| **Button**       | radius .5rem, padding `.5rem 1rem`, font .875rem weight 600, transition `all .2s`. Variants: `primary` (#262B40 / hover #1B1F2E), `secondary` (#61DAFB, text primary), `outline-gray` (white bg, border gray-500, text primary, hover bg gray-300), `danger`, `success`. Sizes `sm` (.375rem .75rem, .75rem). Icon + text gap .5rem. |
| **Button group** | Joined outline-gray buttons, inner radius 0, outer .5rem. |
| **Input**        | height 2.75rem, padding `.55rem .75rem`, border `gray-500`, radius .5rem, text `gray-900`, placeholder `gray-600`. Focus: border `#566190`, ring `0 0 0 .18rem rgba(38,43,64,.15)`. Input-group: left addon with icon, same border, bg white. Error: border `danger` + `0.75rem` danger text below. |
| **Label**        | `0.875rem` weight 600 color `primary`, margin-bottom .5rem. |
| **Checkbox**     | 1.125rem, radius .25rem, checked bg `primary`. |
| **Badge**        | pill, `0.75rem` weight 700, padding `.25rem .6rem`. Status: soft bg (color @12%) + solid text (color). |
| **Table**        | Inside a card, `p-0`. `thead` bg `gray-200`, `th` .75rem uppercase 700 `primary`, padding `.75rem 1.5rem`. Rows: border-top `gray-400`, padding `.75rem 1.5rem`, text `.875rem gray-900`, hover bg `gray-100`. Trend cells colored success/danger with ▲/▼. |
| **Dropdown**     | white, radius .5rem, `shadow-volt`, border `gray-400`, items `.875rem` padding `.5rem 1rem`, hover bg `gray-300`. |
| **Modal**        | white, radius .875rem, `shadow-volt-lg`, header title h5, footer right-aligned buttons; backdrop `rgba(38,43,64,.5)`. |
| **Toast**        | top-right, white card + left 4px status bar. |
| **Empty state**  | centered icon (gray-600, 2.5rem), h5 title, small gray-700 text, primary button. |
| **Skeleton**     | `gray-300` blocks with subtle pulse. |

## 6. Login page (Volt "Sign in" page)
- Full-screen bg `gray-200` (optional faint illustration/pattern on right, very low contrast).
- Top-left link: `← Back to homepage` (`gray-700`, .875rem) — optional, only if public site exists.
- Centered card: max-width **450px**, white, border `gray-400`, radius .5rem, `shadow-volt`,
  padding `2.5rem` (desktop) / `1.5rem` (mobile).
- Content top→bottom:
  1. Logo (40px) centered + h3 **"Sign in to our platform"** (weight 600, `primary`, centered, mb 2rem)
  2. Label "Your Email" → input-group with envelope icon, placeholder `example@company.com`
  3. Label "Your Password" → input-group with lock icon + eye toggle on right
  4. Row: ☐ "Remember me" (left) · "Lost password?" link (right, `.875rem`, `primary`, weight 600)
  5. Full-width primary button **"Sign in"** (height 2.75rem). Loading → spinner + "Signing in…", disabled.
  6. Error alert above the form: bg `rgba(250,82,82,.1)`, text `danger`, radius .5rem, `.875rem`.
- No social login, no "create account" (admin-only system) unless overview says so.

## 7. Motion
- Transitions `.2s ease` on bg/border/color. Sidebar drawer slide `.3s`.
- Cards: no hover lift (Volt is static); table rows get hover bg only.
- Respect `prefers-reduced-motion`.

## 8. Responsive
- `xl ≥1200`: 3 stat cards per row. `md–lg`: 2 per row. `<md`: stacked.
- `<lg`: sidebar becomes drawer; topbar shows hamburger left of search.
- Tables: horizontal scroll inside card on small screens.

## 9. Don'ts
- ❌ Tailwind default palette colors (`blue-500`, `slate-*`, `indigo-600` …) — use tokens.
- ❌ Inter/Roboto/Poppins — only Nunito Sans.
- ❌ Gradients, glass blur, heavy shadows, rounded-2xl/3xl, emojis as icons.
- ❌ Dark-mode-first. Volt is light body + dark sidebar. (Dark mode only if overview asks.)
