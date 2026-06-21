# STATUS — CampusCore

> Overwritten (not appended) at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## As of: Session 1 — through TASK-11 (Scaffold + Data Model + Auth)

### Done (12 commits on `main`, all pushed)
- **Continuity (TASK-0):** `TASKS.md` (37 tasks), `WAITING_ON_HUMAN.md`, `STATUS.md`.
- **Scaffold (TASK-1–4):** Next.js App Router + Convex skeleton; ESLint flat
  config + Prettier; `.env.example` (all keys, no values); Convex+Clerk
  providers wired stub-tolerantly in `app/providers.tsx` + `app/layout.tsx`.
- **Data Model (TASK-5–7):** `convex/schema.ts` — `tickets`,
  `_telegram_egress_queue` (with the load-bearing
  `by_status_priority_created` compound index), `_critical_escalations`.
  Plus `pairings` + `users` tables added during auth.
- **Auth (TASK-8–11):** Clerk middleware w/ `@smu.edu.sg` defense-in-depth gate
  (`middleware.ts`); Convex+Clerk `auth.config.ts` (JWKS RS256 verify, no
  decrypt); deep-link pairing (`convex/pairing.ts`, 3-min TTL, single-use,
  fail-closed); 30-day re-verification helper (`convex/lib/verification.ts`).

### Next task — TASK-12 (start here)
- **TASK-12: Telegram webhook skeleton** in `convex/http.ts`. Use Convex's
  `httpRouter` + `httpAction`. Parse the Telegram update; verify the
  `X-Telegram-Bot-Api-Secret-Token` header against `TELEGRAM_WEBHOOK_SECRET`
  (env, stubbed). Critically: use the **synchronous webhook-reply slot** —
  respond to a `callback_query` by returning a single JSON body with
  `method: "answerCallbackQuery"` (one method per update, per Telegram's Bots
  FAQ), not a second API round-trip. Then TASK-13 wires ingestion → create
  ticket → enqueue egress → `runAfter(60000, check_emergency_sla)` for tier-1.
- After TASK-13, proceed in `TASKS.md` order: Triage (14–17), Moderation
  (18–21), Egress Queue (22–27), SLA (28–30), Dashboard (31–35), Legal stub
  (36), Validation (37).

### Decisions / non-obvious context for a cold start
- **`convex/_generated/` does not exist yet** — no `npx convex dev` has been
  run (needs the Convex deploy key, deferred — see WAITING_ON_HUMAN.md). All
  backend files import from `./_generated/server`; these resolve only after
  `npx convex codegen`/`dev`. This is expected, not a bug. Likewise `npm
  install` has not been run (no `node_modules`), so `tsc`/`next build`/`eslint`
  can't execute yet — verify compilation once deps + codegen are available.
- **`users` table landed in TASK-10** (pairing redeem upserts it); the 30-day
  gate logic that *reads* it is TASK-11 (`checkVerification`). It is not yet
  wired into a webhook — that happens in TASK-12/13.
- **Doc path discrepancy:** `agents.md` cites `docs/prd.md` / `docs/tech_design.md`
  but files are at repo root. Left as-is.
- **priority_tier discipline:** no client-facing mutation may write it. The
  category-tap mutation (TASK-17) writes `category` only. Keep this invariant.
- Commit style: `[TASK-<n>] ...`, check the box in the SAME commit, push to
  `main` every time.

### Blockers / waiting on human
- **SECURITY:** `origin` remote URL embeds a GitHub PAT in plaintext in
  `.git/config`. Rotate + switch to SSH/credential helper. See
  WAITING_ON_HUMAN.md. Does not block the build.
- All third-party keys + the Cloudflare zone are deferred; everything is built
  against stubs / `.env.example`. See WAITING_ON_HUMAN.md.

### Validation checklist (tech_design §9)
- Not yet run (requires live infra + a deploy). Tracked in WAITING_ON_HUMAN.md.
- Add once `node_modules` + Convex codegen exist: run `npm run typecheck` and
  `npm run lint` to confirm the backend + app actually compile.
