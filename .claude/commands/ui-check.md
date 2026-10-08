---
description: Audit UI files against the Volt design system and fix violations
argument-hint: "[file-or-folder]"
---

Audit **$ARGUMENTS** (default: `frontend/src`) against `.claude/docs/design-system.md`.
Delegate to the `volt-ui-reviewer` agent if available. Then fix every ❌.

## Checklist
**Tokens**
- [ ] No arbitrary hex (`[#...]`, inline `style={{color:'#..'}}`) except inside Recharts props using Volt hexes.
- [ ] No Tailwind default palette (`blue-*`, `slate-*`, `zinc-*`, `indigo-*`, `emerald-*`, `sky-*` …).
- [ ] Body bg `gray-200`, body text `gray-900`, headings `primary`.

**Typography & icons**
- [ ] Only Nunito Sans. Headings weight 600; metrics 700.
- [ ] Only FontAwesome solid icons (no lucide/heroicons mixed in).

**Shape & elevation**
- [ ] Radius .5rem (`rounded-lg`/`.card`/`.btn`); no `rounded-2xl/3xl`.
- [ ] Cards use `.card` (border gray-400 + `shadow-volt-sm`). No gradients, blur, glow.

**Layout**
- [ ] Page lives inside `(panel)` layout → has Sidebar (260px, `primary`) + Topbar.
- [ ] Active sidebar item = `primary-active` bg + `indigo` border.
- [ ] Header row: primary action left / outline-gray group right (when applicable).
- [ ] Responsive: drawer sidebar < 992px; tables scroll horizontally.

**Components**
- [ ] Buttons use `.btn` variants; forms use `.form-label/.form-control/.invalid-feedback`.
- [ ] Tables use `.table-volt` inside a `.card`.
- [ ] Loading skeleton, empty state, and error alert exist.
- [ ] Interactive elements have unique `id`s.

**Auth**
- [ ] Page is not reachable logged-out (proxy + panel guard).
- [ ] Logout present in Topbar dropdown.

Output a table: `Rule | Status (✅/❌) | File:line | Fix applied`.
