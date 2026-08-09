# GapCode Handoff — Niazat App Redesign

**Purpose:** Continuity notes for whoever (human or GapCode session) picks up the Niazat App UI/UX redesign next. This file documents everything inspected and decided so far. No code changes have been made yet — this session only performed read-only inspection plus environment/permission verification.

---

## 1. Original Request & Constraints

The user asked for a **complete visual identity, UI, and UX redesign** of the Niazat App while strictly **preserving all existing application logic, services, permissions, integrations, data flows, API behavior, and functional capabilities**.

Key constraints from the original brief:

- This must be a genuine UI/UX redesign — not a CSS refresh, color swap, template replacement, or superficial reskin.
- Do not change core business logic, backend behavior, API contracts, routes, permissions, auth, roles, validation, or data handling unless a very small compatibility change is absolutely required for the new interface — and any such change must be minimal, fully verified, and non-breaking.
- Do not rename/remove identifiers, selectors, routes, components, functions, fields, APIs, or event bindings relied on elsewhere without verifying and updating every dependency.
- Full scope: landing/auth/dashboard/nav/forms/tables/modals/empty-loading-error states/settings/academic & research workflows/presentation screens — across mobile, tablet, laptop, desktop, large screens.
- Must build a reusable **design system** (tokens for color, typography incl. Persian, spacing, radius, shadows, elevation, icons, states, breakpoints, z-index) rather than styling pages ad hoc.
- Must implement a **user-selectable theme system** with at least 4 themes: Simple Light, Simple Dark, Microsoft Fluent-inspired, Linear/Vercel-inspired (original designs, not direct copies), persisted across visits, no flash-of-wrong-theme on load.
- Must preserve and improve full **RTL / Persian-language support** (typography, numerals, dates, mixed Persian/English content, directional icons, form/table alignment, truncation of long Persian titles, etc.).
- **Accessibility** is a core requirement: contrast, keyboard focus, tab order, labels, reduced motion, semantic HTML, no color-only signaling.
- **Performance**: stay lightweight — no unnecessary frameworks/dependencies, optimized local assets only, no unstable remote image URLs.
- Product context: Niazat App is an academic/educational/research/professional support platform (universities, professors, researchers, students, academic staff) — visual identity must convey intelligence, credibility, calm professionalism, trust; avoid childish, generic, template-like, or visually noisy design.
- **Git safety**: do not reset, clean, checkout, revert, delete existing work, rewrite history, push, pull, merge, rebase, or switch branches unless explicitly authorized. Do not overwrite unrelated uncommitted user changes.
- **Clarification requirement**: any ambiguous, materially significant design/technical/permission/workflow decision must be raised as a question rather than assumed, unless a safe, reversible, low-risk default is available (in which case the assumption must be stated explicitly).
- After implementation: run available tests, do a regression review, and clearly state what could/could not be verified (especially if the environment lacks browser/runtime/DB testing).

## 2. Exact Project Path & Workspace Restrictions

- **Project path (Windows):** `C:\Users\hamid.kazemi\Desktop\niazat-app`
- **Project path (WSL/Linux view):** `/mnt/c/Users/hamid.kazemi/Desktop/niazat-app`
- The user authorized inspection/modification **only** inside this exact directory. No parent directories, other Windows folders, other WSL paths, other Git repositories, browser data, SSH keys, credentials, global git config, unrelated env vars, network/external drives were to be touched.
- **Verified sandbox reality (this session):** GapCode's default writable roots were `/home/hamidkazemi` and `/tmp` only. Writes to `/mnt/c/...` (including this project) required per-action escalation approval from the user. The user chose **Option B**: relaunch GapCode in a *new session* with:
  ```
  gapcode -C "/mnt/c/Users/hamid.kazemi/Desktop/niazat-app" -s workspace-write -a on-request
  ```
  This scopes the writable root to this project folder for that new session. Note: GapCode's **read** access remains filesystem-wide regardless (no CLI flag narrows reads to one folder) — only writes are scoped by `-C`/`-s workspace-write`.
- **This current session's file writes remain restricted to `/home/hamidkazemi` and `/tmp`.** Writing this handoff file into the project required an explicit escalated-approval command from the user, run once, for this single file.
- Confirm sandbox state at the start of any new session with `gapcode doctor` (check `cwd` and the `sandbox` block).

## 3. What Was Inspected (Read-Only)

- Repository root listing: `.git`, `.gitignore`, `README.md`, `apps/`, `docker-compose.yml`, `docs/`.
- Monorepo layout: `apps/api` (NestJS backend) and `apps/web` (Next.js frontend), plus `docs/specs/*` (architecture and UI blueprint docs already exist there — worth reading before design work: `docs/specs/architecture-v4.md`, `docs/specs/ui-pages-blueprint-v2.md`, `docs/specs/addendum-state-machine-ledger.md`, `docs/ROADMAP.md`).
- `apps/api/package.json` scripts: `build` (nest build), `start`/`start:dev`/`start:debug`/`start:prod`, `lint` (eslint --fix), `test`/`test:watch`/`test:cov`/`test:e2e` (jest), `prisma:seed`.
- `apps/web/package.json` scripts: `dev` (next dev), `build` (next build), `start` (next start), `lint` (eslint). Dependencies: Next.js `16.2.10`, React `19.2.4`, Tailwind CSS `^4` (via `@tailwindcss/postcss`, no separate `tailwind.config.*` file — Tailwind v4 CSS-first config), Playwright (`^1.61.1`, present as devDependency — likely used for e2e/browser smoke scripts).
- `apps/web/src/app/globals.css`: currently minimal — defines `--background`/`--foreground` CSS vars, a Tailwind v4 `@theme inline` block, and a body font-family referencing `--font-vazirmatn` (Persian font already wired in) with Tahoma/sans-serif fallback.
- Confirmed presence of Persian font integration (`vazirmatn`) already in the codebase — should be reused/extended, not replaced, unless there's a reason to change it.
- `docker-compose.yml`: defines a single `postgres:16` service (db `niazat`, default postgres/postgres credentials, port 5432) — the only infra service in this compose file. No other services (redis, etc.) defined here.
- Confirmed `apps/web/.env.local` and `apps/api/.env` + `apps/api/.env.example` exist (contents were **not read** — out of scope for this inspection, treat as sensitive).
- `apps/web/node_modules` and `apps/api/node_modules` exist (dependencies already installed in this checkout).
- An `AGENTS.md` was found only inside `apps/api/node_modules/ts-loader/AGENTS.md` — this is a third-party package file, not a project-authored instruction file, and should be ignored/not treated as project guidance.

## 4. Frontend Structure (`apps/web`, Next.js App Router)

Route groups identified under `apps/web/src/app/`:

- `(admin)/admin/` — admins, finance (+ escrow, ledger, payments sub-pages), orders (+ `[id]`), page (dashboard), qc (+ `[id]`), staff (+ `[id]`), users. Has its own `layout.tsx`.
- `(customer)/` — dashboard, orders (+ `[id]`, `new`), tickets (+ `[id]`, `new`), wallet. Has its own `layout.tsx`.
- `(executor)/executor/` — orders (+ `[id]`), page (dashboard), performance. Has its own `layout.tsx`.
- `(support)/support/tickets/` — list + `[id]`. Has its own `layout.tsx`.
- Public/shared: `login/page.tsx`, `register/page.tsx`, `services/page.tsx` (+ `[slug]`), root `page.tsx` (landing), root `layout.tsx`.

Shared components (`apps/web/src/components/`): `app-shell.tsx`, `public-nav.tsx`, `require-role.tsx` (role-gating — do not weaken this), `status-badge.tsx`, `ui.tsx` (shared primitives incl. `LinkButton`).

Shared lib (`apps/web/src/lib/`): `api.ts` (API client — central point for all backend calls, touch with extreme care), `auth-context.tsx` (auth state/session), `format.ts`, `role-paths.ts` (role → route mapping, ties directly to permissions/navigation), `types.ts`.

This confirms **role-based UI segregation is structural** (admin / customer / executor / support are separate route groups with separate layouts) — the redesign must preserve this segregation exactly; navigation/theme work should be layered per-role-layout, not merged.

## 5. Backend Structure (`apps/api`, NestJS)

Modules identified under `apps/api/src/`: `app` (root controller/module), `audit`, `auth` (+ dto: login/otp/register, + jwt strategy), `catalog` (+ admin controller, dto), `common` (decorators: admin-scopes, current-user, public, roles; dto: pagination; filters: http-exception; guards: admin-scope, jwt-auth, roles; types: authenticated-user; utils: business-hours incl. spec test, code-generator), `executor` (+ dto, staff admin controller), `feedback`, `files`, `finance` (customer-finance controller, dto, escrow/invoices/ledger/payment-gateway/payments/wallet/withdrawals services, admin controller), `notifications` (+ sms service), `orders` (dto, **order-state-machine.ts + its own spec test** — this is a critical business-logic file, must not be touched), `prisma` (module/service — DB access layer), `qc` (dto, controller, module, service), `tickets` (dto, controller, module, service — plus what appears to be a separate support-facing tickets controller), `users` (dto, settings controller/service, admin controller, module, service).

Prisma: `apps/api/prisma/schema.prisma` plus at least two migrations (`20260708101803_init`, `20260708103639_qc_review_reviewer_optional`) and a `seed.ts`. This is the authoritative data model — frontend redesign should never require backend/schema changes; if anything in the UI seems to need a data shape change, that's a flag to ask the user rather than modify Prisma files.

Auth/permissions backbone: `auth.module.ts`/`auth.service.ts`/`auth.controller.ts` + JWT strategy + `roles.guard.ts`/`roles.decorator.ts`/`admin-scope.guard.ts`/`admin-scopes.decorator.ts` + `jwt-auth.guard.ts`/`public.decorator.ts`. These define the role/permission system end-to-end (customer/executor/support/admin, plus admin scopes) — matches the frontend's route-group segregation. **None of these files should be touched for a visual redesign.**

## 6. Current Git Status

- **Current branch:** `cursor/niazat-platform-build-8a4e` (tracking `origin/cursor/niazat-platform-build-8a4e`). A `main` branch and its remote counterpart also exist locally.
- **Remote:** `origin` → `https://github.com/hamid-402/niazet.git` (fetch+push).
- **Pre-existing uncommitted changes:** `git status` shows roughly 150+ modified files across almost the entire repo (`.gitignore`, `README.md`, most of `apps/api/src/**`, most of `apps/web/src/**`, config files, docs). **This was already present before this session touched anything** — this session made no edits to project files.
- **Root cause identified:** these diffs are line-ending related. Example: `apps/web/src/app/page.tsx` shows as "110 insertions / 110 deletions" in a full-file diff, but `git diff --ignore-space-at-eol` on `apps/web/src/lib/api.ts` returns **zero real changes** — confirmed via byte inspection that the working-tree file has CRLF (`\r\n`) line endings while the committed `HEAD` version has LF (`\n`) only. `core.autocrlf` is `false` in the repo's local git config, and `core.filemode=false`.
- **Implication:** this is very likely a pre-existing Windows/WSL line-ending checkout artifact, **not** content changes. It must be independently confirmed (not assumed) before any commit is made, and it should **not** be staged/committed/reset as part of the redesign work — per the Git-safety constraints, existing uncommitted state must be preserved untouched unless the user explicitly authorizes cleanup.
- **No commits, resets, merges, rebases, branch switches, pulls, or pushes were performed in this session.**

## 7. Identified UI/UX & Technical Findings (Preliminary)

- Styling foundation is minimal today: `globals.css` only defines two CSS variables and a Tailwind v4 theme inline block — there is no existing design-token system, no documented spacing/radius/shadow scale, and (per Tailwind v4) no central `tailwind.config.*` file to extend; tokens should be defined via CSS custom properties / `@theme` blocks per Tailwind v4 conventions.
- No existing theme-switcher mechanism was found in the inspected files — a theme system (light/dark/Fluent/Linear-Vercel-inspired, persisted, no flash-of-wrong-theme) will need to be built from scratch.
- Persian font (`vazirmatn`) is already integrated at the layout/body level — reuse this as the base typography rather than introducing a new font stack unless there's a stated reason.
- Strict role-based route-group structure (admin/customer/executor/support) with **separate layouts per role** — this is both a UX opportunity (tailor nav per role) and a risk area (must not cross-wire navigation/permissions between role groups while restyling).
- `apps/api/scripts/e2e-smoke.sh` and `apps/web/scripts/e2e-browser-order-flow.mjs` / `e2e-browser-smoke.mjs` exist — these are useful regression-check assets for later validation of the redesign, especially the order flow.
- Docs directory already contains a UI blueprint (`docs/specs/ui-pages-blueprint-v2.md`) and architecture spec (`docs/specs/architecture-v4.md`) that should be read in full before starting design work — they may already define page-level requirements or prior design intent that the redesign should respect or consciously supersede (with the user's sign-off).

## 8. Theme & Design Requirements (From User Brief)

- Minimum 4 selectable themes: **Simple Light**, **Simple Dark**, **Microsoft Fluent-inspired** (blue-grey tones, subtle acrylic effects, corporate polish), **Linear/Vercel-inspired** (sharp minimalism, high-contrast dark surfaces, tech-focused). Optionally 1–2 more original, maintainable themes.
- All themes must be original (not direct copies), selectable in the UI, persisted (e.g., localStorage + no-FOUC loading strategy), and consistently applied across every component/state/breakpoint.
- Full design-token system required (colors incl. semantic/status colors, Persian+English typography, spacing, grids, container widths, radius, borders, shadows/elevation, icon system, control sizes, focus/hover/active/selected/disabled states, transitions, breakpoints, density, z-index layers).
- Visual tone target: professional, premium, modern, minimal, academic-appropriate, calm, trustworthy — explicitly avoid childish, generic, template-like, overly colorful, or cluttered design.

## 9. Functional Areas That Must Not Be Changed

- All NestJS modules/services/controllers/guards/decorators under `apps/api/src/**` (business logic, auth, roles, admin scopes, finance/escrow/ledger/payments, orders state machine, QC, tickets, notifications, files, catalog, audit).
- Prisma schema and migrations (`apps/api/prisma/**`).
- `apps/web/src/lib/api.ts` (API client), `auth-context.tsx` (auth/session state), `role-paths.ts` (role→route mapping) — these are the frontend/backend contract seams; any touch here must be a verified, minimal compatibility shim only, never a behavior change.
- `require-role.tsx` and any role-gating logic in layouts — permission enforcement must remain identical.
- Route paths/URL structure, component prop contracts, event handler bindings, element IDs/selectors relied on by scripts (e.g., the Playwright e2e scripts) — unless verified safe to change with all dependents updated.
- Environment files (`.env`, `.env.example`, `.env.local`) — not to be read or modified as part of a visual redesign.

## 10. Testing Limitations (This Session)

- This session performed **static, read-only inspection only** — no dev server, build, or test suite was run.
- Nothing was verified at runtime: no page rendering, no browser testing, no API calls, no database connectivity, no theme switching, no RTL rendering, no responsive behavior, no accessibility audit, no lint/test/build execution.
- What *was* verified statically: repository file/folder structure, package.json scripts, dependency versions, CSS/theme scaffolding present today, Git status/branch/remote, and line-ending nature of the pending diffs (via `git diff --ignore-space-at-eol` and raw byte inspection).
- **Recommended before/while implementing:** run `apps/web`'s `npm run dev`/`npm run build`/`npm run lint`, `apps/api`'s `npm run test`/`npm run test:e2e`/`npm run lint`, and the existing e2e smoke scripts (`apps/api/scripts/e2e-smoke.sh`, `apps/web/scripts/e2e-browser-*.mjs`) after each meaningful change batch, plus manual browser checks for theme switching, RTL, and responsive breakpoints, since none of this could be exercised in this inspection-only session.

## 11. Open Questions & Unresolved Decisions

These were flagged as needing the user's input before/while implementing (not yet answered as of this handoff):

1. Should the CRLF-vs-LF pending diff be normalized/fixed (e.g., via `.gitattributes` + a one-time re-normalization commit) before redesign work starts, or left completely alone and worked around?
2. Should `docs/specs/ui-pages-blueprint-v2.md` and `architecture-v4.md` be treated as binding requirements to preserve, or superseded by the new redesign brief? (Not yet read in full.)
3. Exact visual/brand preferences beyond the brief: any existing logo, brand color, or reference screenshots to match tone precisely? (Brief describes tone/feel but no concrete brand asset was found in the repo during this pass.)
4. Priority order across the 4+ themes — build all in parallel, or ship one polished theme first and extend?
5. Are the two extra optional theme directions desired, or should scope stay at exactly 4 themes for this phase?
6. Any specific pages/flows the user wants redesigned first (e.g., landing + auth, then dashboards) versus a single simultaneous pass across the whole app?
7. Confirm whether Playwright is only for e2e testing or also used for visual regression snapshots that the redesign must account for.

## 12. Exact Next Steps for a New GapCode Session

1. Start the new session with the write-scoped launch command already agreed:
   ```
   gapcode -C "/mnt/c/Users/hamid.kazemi/Desktop/niazat-app" -s workspace-write -a on-request
   ```
2. Immediately run `gapcode doctor` and confirm `cwd` and the sandbox block match this project before touching anything.
3. Read this file (`GAPCODE_HANDOFF.md`) in full, then read `docs/specs/architecture-v4.md`, `docs/specs/ui-pages-blueprint-v2.md`, and `docs/ROADMAP.md` for any prior design intent.
4. Re-verify current `git status`/branch/remote to confirm nothing changed since this handoff (especially the pending CRLF-related diffs) before making any edits.
5. Ask the user the open questions in Section 11 (grouped, most important first) before starting visual implementation — especially the CRLF-normalization decision, since it affects how cleanly future diffs can be reviewed.
6. Once answered, begin with the design-token/theme-system foundation (CSS variables/Tailwind v4 `@theme` blocks + a theme-provider/persistence mechanism) before touching individual pages, then proceed role-group by role-group (public/auth → customer → executor → support → admin), preserving all logic/permission boundaries noted in Section 9.
7. After each meaningful batch of changes, run the lint/build/test commands listed in Section 10 and report exactly what was and wasn't verified.

---
*This file was generated by a GapCode session that performed read-only inspection and environment/permission verification only. No project files were modified prior to creating this handoff document.*
