# Implementation Plan — Session 3: Unblock, Landing Page, First Real Deploy

> Executable checklist. Every leaf task is atomic, mechanically verifiable,
> and mapped to at least one requirement + design section.
> Wave-scheduled: tasks in the same wave have no dependencies on each other
> and are safe to dispatch concurrently.

## Wave 1 — Guardrails and boundary checks (no runtime deps)

- [x] 1. Add `convex/_generated/` to `.gitignore` and verify no generated
      files are currently tracked
    - Append `convex/_generated/` to `.gitignore` (keep existing lines).
    - Run `git ls-files convex/_generated/` and confirm the output is empty
      (Property 6).
    - _Requirements: 1.5, 10.1, 10.2_
    - _Design: §C1 (Convex codegen unblock), Property 6_

- [x] 2. Write env-boundary grep script
      (`scripts/verify-env-boundary.mjs`)
    - Node script (no deps) that reads `.env.example` and `DEPLOYMENT.md`
      once it exists.
    - Fails non-zero if any name in the Convex-only server-var set
      (`TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`, `LLM_BASE_URL`,
      `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ESCALATION_TO`,
      `NSFW_MODEL_URL`, `CLERK_JWT_ISSUER_DOMAIN`) begins with
      `NEXT_PUBLIC_` OR appears in the Vercel checklist section of
      `DEPLOYMENT.md` (except the three mirrored vars).
    - _Requirements: 4.5, 4.6, 5.6, 10.4_
    - _Design: §C3, Property 1_

- [x] 3. Write deletable-promo grep script
      (`scripts/verify-deletable-promo.mjs`)
    - Node script that walks `app/dashboard/`, `app/volunteer/`,
      `app/admin/`, `app/api/`, and `middleware.ts` (skip if the path does
      not exist).
    - Fails non-zero if any file in those trees imports from
      `app/(promo)/` or `components/promo/` (regex on import statements).
    - _Requirements: 7.7, 8.5, 12.5_
    - _Design: §C4, Property 3_

- [x] 4. Write no-committed-codegen grep script
      (`scripts/verify-no-committed-codegen.mjs`)
    - Node script that shells `git ls-files convex/_generated/` and
      fails non-zero if the output is non-empty.
    - _Requirements: 1.5, 10.1, 10.2_
    - _Design: §C1, Property 6_

- [x] 5. Add `isAdminEmail` unit test (`config/school.test.mjs`)
      using `node --test`
    - New file, no new devDependency.
    - Sets `process.env.CAMPUSCORE_SCHOOL_CODE = "smu"` before each case.
    - Asserts:
      - `isAdminEmail("")` → `false` with allowlist unset.
      - `isAdminEmail("bryan.seah.2024@smu.edu.sg")` → `false` with
        allowlist unset (fail-closed).
      - `isAdminEmail("bryan.seah.2024@smu.edu.sg")` → `true` after
        setting `CAMPUSCORE_ADMIN_ALLOWLIST` to that address.
      - `isAdminEmail("outsider@gmail.com")` → `false` even if allowlist
        contains it (staff-domain gate).
      - `isAdminEmail("Bryan.Seah.2024@SMU.EDU.SG")` → `true` after
        setting the allowlist to the lowercase form (case-insensitive
        property).
    - Runnable with `node --test config/school.test.mjs`; add
      `test:unit`: `node --test config/**/*.test.mjs convex/**/*.test.mjs`
      to `package.json` scripts.
    - _Requirements: 9.1, 9.2, 9.5_
    - _Design: §C6, Property 2_

- [x] 6. Add Resend stub-mode unit test
      (`convex/lib/resend.test.mjs`)
    - New file, no new devDependency.
    - Save and restore `process.env` around each case.
    - Asserts: when any one of `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
      `RESEND_ESCALATION_TO` is unset, the module's send path stays in
      stub/log mode (does not attempt a network call).
    - Use a stubbed `fetch` global to detect any attempted dispatch.
    - _Requirements: 4.7_
    - _Design: Property 5_

## Wave 2 — Promo landing page (independent of Convex codegen)

- [x] 7. Create `components/promo/` component tree
    - `components/promo/Hero.tsx` — headline + subhead + primary/secondary
      CTAs, Server Component (no `"use client"`), no Convex imports.
    - `components/promo/ValueProps.tsx` — five capability cards adapted
      from `tech_design.md` §§1-9.
    - `components/promo/ForkCta.tsx` — GitHub icon (inline SVG, no
      dependency) + link to `https://github.com/bryanseah234/sgCampusCore2026`
      + link to `/DEPLOYMENT.md` on GitHub.
    - `components/promo/ReferenceDeployment.tsx` — credits SMU reference
      deployment, links to `/dashboard`, states that this domain is the
      template promo.
    - `components/promo/Footer.tsx` — repo link, AGENTS.md constraints
      link, license line.
    - All components render server-side, no client hooks, no Convex
      imports.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
    - _Design: §C4_

- [x] 8. Add `app/(promo)/page.tsx` and (optional)
      `app/(promo)/layout.tsx`; remove `app/page.tsx`
    - `app/(promo)/page.tsx` composes the five components from Task 7 in
      order. Exports `metadata` (`title`, `description`) scoped to the
      promo landing.
    - Optional `app/(promo)/layout.tsx` suppressing the SMU top-nav on the
      promo route (see Open Question §1 — resolve during
      implementation).
    - **Delete `app/page.tsx`** in the same commit to prevent the
      duplicate-`/`-route build error.
    - _Requirements: 7.1, 12.5_
    - _Design: §C4, §Error Handling item 4_

- [x] 9. Commit any promo static assets under `public/promo/`
    - Only files actually referenced by components in Task 7.
    - No binary files larger than 500 KB (Vercel bundle hygiene).
    - _Requirements: 12.4_
    - _Design: §C5 (Static asset 404 row)_

- [x] 10. Verify SMU app routes still reachable after promo split
    - Manual local check (after Convex codegen exists — depends on Task
      13): `GET /`, `GET /dashboard`, `GET /volunteer`, `GET /admin`,
      `POST /api/legal-escalation` all respond as designed.
    - Documented under STATUS.md session evidence.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
    - _Design: §C4, §Testing Strategy manual checklist_

## Wave 3 — Convex authentication and codegen (blocks build)

- [x] 11. Verify `.env.local` and `.env.convex.local` are populated per
      the Session-3 env split
    - Read (do not print secrets) `.env.local`. Confirm keys:
      `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
      `CAMPUSCORE_SCHOOL_CODE=smu`,
      `CAMPUSCORE_ADMIN_ALLOWLIST=bryan.seah.2024@smu.edu.sg`,
      `CSAM_SCAN_ENABLED=false`, `TELEGRAM_WEBHOOK_SECRET=<value>`,
      `NEXT_PUBLIC_APP_URL=https://sgcampuscore.hong-yi.me`.
      `NEXT_PUBLIC_CONVEX_URL` may still be blank at this point.
    - Read `.env.convex.local`. Confirm keys: `CONVEX_DEPLOY_KEY`,
      `CLERK_JWT_ISSUER_DOMAIN`, `TELEGRAM_BOT_TOKEN`,
      `TELEGRAM_WEBHOOK_SECRET`, `GROQ_API_KEY`, `LLM_BASE_URL`,
      `RESEND_API_KEY`, `CAMPUSCORE_SCHOOL_CODE`,
      `CAMPUSCORE_ADMIN_ALLOWLIST`, `CSAM_SCAN_ENABLED`.
    - Fail-close if any required key is missing; add to
      WAITING_ON_HUMAN.md instead of proceeding.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
    - _Design: §C3_

- [x] 12. Establish a non-UNC working copy for Convex CLI operations
    - Reuse or recreate the Local_Mirror at
      `C:\Users\bryan\AppData\Local\Temp\opencode\sgCampusCore2026-local`.
    - `robocopy` (or equivalent) sync excluding `node_modules`, `.next`,
      `.git`, `.omo`, `.convex`, and `convex/_generated/`.
    - Copy the two `.env*.local` files into the mirror as well (they are
      needed for `npx convex dev --once` to read
      `CONVEX_DEPLOY_KEY`).
    - _Requirements: 1.6_
    - _Design: §C1 (UNC path unreliability)_

- [x] 13. Run `npx convex dev --once` in the Local_Mirror to authenticate
      and generate codegen
    - Ensure `CONVEX_DEPLOY_KEY` is exported (from `.env.convex.local`).
    - `npm ci --no-audit --no-fund` if `node_modules` missing.
    - `npx convex dev --once`.
    - On success: capture the printed Convex deployment URL. Write it
      into `.env.local` at both the mirror and the UNC repo as
      `NEXT_PUBLIC_CONVEX_URL=<url>`.
    - Confirm `convex/_generated/api.js`, `api.d.ts`, `dataModel.d.ts`,
      `server.d.ts`, `server.js` all exist in the mirror.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
    - _Design: §C1, Property 4_

- [ ] 14. Seed Convex_Env via `npx convex env set` for every Convex-side
      variable
    - From the Local_Mirror, run one `npx convex env set NAME VALUE` per
      key, sourcing values from `.env.convex.local`:
      `CLERK_JWT_ISSUER_DOMAIN`, `TELEGRAM_BOT_TOKEN`,
      `TELEGRAM_WEBHOOK_SECRET`, `GROQ_API_KEY`, `LLM_BASE_URL`,
      `RESEND_API_KEY`, `CAMPUSCORE_SCHOOL_CODE`,
      `CAMPUSCORE_ADMIN_ALLOWLIST`, `CSAM_SCAN_ENABLED`.
    - `RESEND_FROM_EMAIL` and `RESEND_ESCALATION_TO` remain unset (stub
      mode until human sets them — WAITING_ON_HUMAN.md).
    - Verify with `npx convex env list` that every key is present.
    - _Requirements: 6.1, 6.3, 6.5_
    - _Design: §C1, §C7 §5_

- [ ] 15. Copy fresh `convex/_generated/` back into the UNC repo tree
      **only if needed for local dev on that path**
    - Since `.gitignore` covers the directory (Task 1), nothing is
      staged — this is a local convenience so editors on the UNC path
      resolve `@/convex/_generated/*` imports.
    - Alternative: work from the Local_Mirror only; document in
      DEPLOYMENT.md.
    - _Requirements: 1.6_
    - _Design: §C1_

## Wave 4 — Local build green (blocked on Wave 3)

- [ ] 16. Run `npm run typecheck` in the Local_Mirror; fix generated-type
      fallout
    - Expected fallout: type mismatches between the placeholder
      `Id<"tickets">` shapes in `app/dashboard/page.tsx` and the actual
      generated `Doc<"tickets">` / `Id<"tickets">` from Convex.
    - Fix by narrowing local aliases to match the generated types
      **without** changing runtime behavior.
    - _Requirements: 2.1, 2.4_
    - _Design: §C5 row 2_

- [ ] 17. Run `npm run lint` in the Local_Mirror; fix any regressions
    - _Requirements: 2.2_

- [ ] 18. Run `npm run build` in the Local_Mirror; fix any build
      failures inside Session 3 scope
    - Anticipated: promo image 404s (Task 9), metadata warnings (Task
      8), TS strict-mode issues on generated types (Task 16).
    - **Halt if a failure requires an AGENTS.md-approval-checkpoint
      change** — file it in WAITING_ON_HUMAN.md instead (Requirement
      13.6).
    - _Requirements: 2.3, 2.5, 2.6_
    - _Design: §C5_

- [ ] 19. Run all Wave-1 verification scripts and the unit tests
    - `node scripts/verify-env-boundary.mjs`
    - `node scripts/verify-deletable-promo.mjs`
    - `node scripts/verify-no-committed-codegen.mjs`
    - `npm run test:unit` (added in Task 5).
    - All must exit 0.
    - _Requirements: 4.5, 4.6, 5.6, 7.7, 9.1, 9.2, 9.5, 10.1, 10.2_

## Wave 5 — Deployment documentation and Vercel wiring

- [ ] 20. Rewrite `DEPLOYMENT.md` per design §C7 structure
    - Overview / Prerequisites / Env variable reference table / Local
      dev setup / Convex env seeding (with `<PLACEHOLDER>` values only) /
      Vercel setup / Fork-and-deploy runbook / AGENTS.md hard
      constraints / Troubleshooting / Approval-checkpoint reminder.
    - **Never** include a real secret value. Placeholders must be
      obviously fake.
    - Include an explicit note that this session ships **Preview only**;
      Production requires a `prod:` deploy key (WAITING_ON_HUMAN.md).
    - _Requirements: 4.1, 4.4, 5.1–5.6, 6.1, 6.2, 10.4, 11.1–11.6_
    - _Design: §C3, §C7_

- [ ] 21. Update Vercel project Build Command to
      `npx convex deploy --cmd 'next build'`
    - This is a Vercel dashboard action (Project Settings → Build &
      Development Settings). Cannot be scripted from the repo.
    - Record the change (with a screenshot or the exact string) in the
      Session-3 STATUS.md entry.
    - _Requirements: 3.1, 3.2, 3.4_
    - _Design: §C2_

- [ ] 22. Populate Vercel Project Environment Variables per §5 checklist
    - Preview scope, Production scope, Development scope — set each
      variable listed in DEPLOYMENT.md §C3 Nextjs_Env column with the
      correct scope and Secret flag.
    - Preview scope: `CONVEX_DEPLOY_KEY` = the current preview deploy
      key.
    - Production scope: leave `CONVEX_DEPLOY_KEY` unset (deploy will
      fail-fast per Property 4) until a `prod:` key is generated.
    - _Requirements: 3.3, 5.1–5.5_
    - _Design: §C2_

- [ ] 23. Trigger a Vercel Preview deploy and confirm green
    - Push the Session-3 branch. Watch the build in Vercel.
    - Assertions:
      - Build Ready.
      - `GET /` returns the Promo_Site (Task 8).
      - `GET /dashboard` returns the SMU dashboard shell (setup state or
        real, depending on Convex env).
      - No secret prefixed with `NEXT_PUBLIC_` visible in the browser
        bundle (view-source spot check).
    - _Requirements: 12.1–12.5_
    - _Design: §C2, §Testing Strategy_

## Wave 6 — Session close

- [ ] 24. Update `STATUS.md` with Session-3 outcomes
    - Overwrite (per file convention) with:
      - "As of: Session 3 — unblock, promo landing, first Vercel Preview."
      - Done-this-session bullet list.
      - Validation evidence (script exits, test results, Vercel build
        URL).
      - Any remaining blockers.
      - Next-agent checklist.
    - _Requirements: (session hygiene, not tied to a specific AC)_

- [ ] 25. Update `WAITING_ON_HUMAN.md` with Session-3 residuals
    - Add: generate `prod:` Convex deploy key; populate Vercel Production
      env; set `RESEND_FROM_EMAIL` / `RESEND_ESCALATION_TO` in Convex
      env; enable Google social connection in Clerk dashboard; create
      Clerk JWT template named `convex` if not already present.
    - Keep the pre-existing Cloudflare / calibration / approval-checkpoint
      items unchanged.
    - _Requirements: 5.5, 11.4_

- [ ] 26. Tick the Session-3 rows in root `TASKS.md`
      (TASK-41 … TASK-47)
    - Match completed work to the checklist rows.
    - Anything not fully closed becomes an explicit residual in
      WAITING_ON_HUMAN.md instead of silently checked.
    - _Requirements: (session hygiene)_
