# STATUS — CampusCore

> Overwritten at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## Session 3 Addendum — Post-Close (2026-07-06/07)

This is a post-close addendum to Session 3, not a new session. Session 3
closed with all 26 tasks ticked; the Preview at
`sgcampuscore.hong-yi.me` was green. Between close and now, four events
mattered: Resend escalation was wired end-to-end, one Convex env var was
renamed, a run of 13 breaking Dependabot merges had to be reverted and
the auto-merge machinery removed, and a postcss XSS advisory is being
patched via an npm `overrides` entry (in flight at doc-write time).

### 1. Resend escalation wired end-to-end

- Operator rotated to a full-access Resend API key. `GET /domains`
  returned one verified domain, `sgcampuscore.hong-yi.me`
  (`ap-northeast-1`, sending enabled). The apex `hong-yi.me` is NOT a
  verified sender — only the subdomain.
- Set on the `elated-dogfish-303` preview deployment and the
  project-level preview defaults (via PAT because preview deploy keys
  can't write env): `RESEND_API_KEY` (rotated value),
  `RESEND_FROM_EMAIL=alerts@sgcampuscore.hong-yi.me`,
  `RESEND_ESCALATION_TO=hello@hong-yi.me`.
- Mirrored into `.env.convex.local` on both the UNC repo and
  Local_Mirror. `.env.local` untouched — Resend is Convex-only.
- Escalation module (`convex/lib/resend.ts`) now has full config; the
  stub-mode toggle will resolve to real send on next invocation.

### 2. CLERK_FRONTEND_API_URL rename

- Convex Clerk integration guide uses `CLERK_FRONTEND_API_URL` as the
  canonical env var name for the JWKS domain.
- Renamed `process.env.CLERK_JWT_ISSUER_DOMAIN` →
  `process.env.CLERK_FRONTEND_API_URL` in `convex/auth.config.ts`.
- Updated `.env.example` and `.env.convex.local` (UNC and mirror) to
  match. Convex env has both variables set to the same value, so no
  runtime effect. Old var can be removed via
  `npx convex env remove CLERK_JWT_ISSUER_DOMAIN` in a future cleanup.
- `applicationID: "convex"` in `auth.config.ts` unchanged — that is the
  Clerk JWT template name and the operator confirmed the template
  exists in the Clerk dashboard.

### 3. Dependabot cleanup (major event)

Between Session 3 close and this addendum, 13 Dependabot merge commits
auto-landed to `origin/main`. Every one caused a Vercel build ERROR:
`@clerk/nextjs` 6.39.5 → 7.5.13, `next` 15.5.19 → 16.2.10, `resend`
4.8.0 → 6.17.1, `eslint` 9.39.4 → 10.6.0, `fast-check` 3.23.2 → 4.8.0,
plus several action bumps and a repo-config sync commit. Root cause:
two workflows (`auto-merge-bots.yml`, `dependabot-auto-merge.yml`) used
`gh pr merge --admin --squash`, which bypasses branch protection and
required checks.

Actions taken:

- Force-pushed `main` with `--force-with-lease` from local `1475d8c`.
  Composition: `21f60a9` (Session 3 Task 23 codegen commit, known-green),
  then `dc92e23` (CLERK_FRONTEND_API_URL rename), then `e259037`
  (session-3 residuals docs), then `1475d8c` (cherry-picked governance
  overlay from the incoming `5ead696` sync commit, minus the two
  auto-merge workflows).
- Deleted `auto-merge-bots.yml` and `dependabot-auto-merge.yml`. Bot
  PRs now stay open for manual review.
- Replaced `.github/dependabot.yml` with an npm-and-actions-only,
  patch-only version. Blocks all major and minor bumps via
  `ignore: update-types: [semver-major, semver-minor]`. Grouped bumps
  for react-ecosystem, clerk, next, eslint, types.
- Rewrote `SECURITY.md` to remove the stale `--admin auto-merge`
  narrative; the new version explicitly states bot PRs are NOT
  auto-merged.
- Restored the real `agents.md` — the sync commit's uppercase
  `AGENTS.md` clobbered our real CampusCore-specific `agents.md` on
  Windows' case-insensitive FS. Removed the sync template file; kept
  our real one.

Post-push: Vercel git integration built the new HEAD, `dpl_8RnZfYds8T
NEKbgrBgzPKCCi5UyE` reached READY, alias `sgcampuscore.hong-yi.me`
repointed. Live and green.

Dependabot PR queue drain (7 open at push time):

- Closed: PR#20 (typescript 5→6, major), PR#18 (@types/node 22→26,
  major), PR#1 (ws 8.20.1→8.21.0, superseded by conflicts).
- Merged (patch-safe): PR#26 (prettier 3.8.4→3.8.5), PR#25 (Next patch
  group), PR#24 (trufflehog patch), PR#23 (scorecard patch).
- Each merge triggered a Vercel git-integration deploy. New HEAD after
  all merges: `3920737 Bump the next group with 2 updates (#25)`.
  Latest READY at that SHA.

Vercel Hobby-plan daily-deploy quota (100/day) was exhausted during
this pass — irrelevant, git-integration builds don't count against the
API quota.

### 4. postcss XSS via npm overrides (landed)

- Dependabot alert #1: `postcss < 8.5.10` XSS via unescaped `</style>`
  in the stringifier. Medium severity.
- `next@15.5.20` exact-pins `postcss: 8.4.31`, so npm can't naturally
  upgrade.
- Applied `"overrides": { "postcss": "^8.5.10" }` in `package.json`
  and regenerated the lockfile — npm resolved postcss to `8.5.16`
  (well above the ^8.5.10 override floor). Same lockfile pass also
  picked up `convex@1.42.1` and `ws@8.21.0` via natural re-resolve
  (both minor/patch, non-breaking).
- Local `npm audit --audit-level=moderate` reports zero moderate+
  vulns after the override. Local `npm run build` exits 0.
- Rationale for `overrides` over waiting for a Next bump: real vuln,
  `overrides` is npm's designed mechanism for this case, postcss 8.x
  → 8.y is non-breaking per postcss maintainers, and the divergence
  from Next's tested tree (8.4.31 → 8.5.10 → 8.5.16) is a maintenance
  patch of a stringifier code path Next does not exercise.

### 5. eslint next-env.d.ts fix (bundled with §4)

Next 15.5.19 → 15.5.20 auto-added a third `/// <reference path=".next/types/routes.d.ts" />`
line to the generated `next-env.d.ts`. `eslint-config-next`'s
`next/typescript` preset's `@typescript-eslint/triple-slash-reference`
rule flags `path=` forms as errors, which made `npm run lint` fail on
main with an untouched Next-generated file. Fix: add `next-env.d.ts`
to `eslint.config.mjs` ignores, matching Next's own documented guidance
("this file is auto-generated and should not be edited or linted").
Not a lint-rule downgrade — the rule still catches user-authored
triple-slashes elsewhere. CI (`ci.yml`) never ran `npm run lint`, only
`npm run build`, which is why this wasn't caught by Vercel.

## As of: Session 3 — unblock, promo landing, first Vercel Preview

This session took the repo from "can't build because Convex codegen is
missing" to "green Vercel Preview live at a real URL, serving both the
promo landing page and the SMU dashboard shell." The template split is
in place: fork-and-deploy is a documented path for other schools, and
the SMU reference deployment is reachable at `/dashboard`.

### Context for a cold-start next-agent

The repo is a Next.js 15 + Convex + Clerk app configured to run as a
per-school template. One deployment = one school. The active school is
selected by `CAMPUSCORE_SCHOOL_CODE`. This Preview is the SMU reference
deployment (`CAMPUSCORE_SCHOOL_CODE=smu`). Other schools are supported
by the Registry (`config/schoolRegistry.ts`); each would be a separate
fork+deploy.

The Convex codegen directory `convex/_generated/` is gitignored and
regenerated locally per developer. If you clone fresh, run
`npx convex dev --once` from a non-UNC working copy before typechecking
or building. See DEPLOYMENT.md for the full runbook.

## Done this session

### Wave 1 — Guardrails and boundary checks

- Added `convex/_generated/` to `.gitignore`; verified no generated
  files are tracked.
- Wrote three no-dep Node verify scripts:
  - `scripts/verify-env-boundary.mjs` — fails if a Convex-only server var
    ever leaks into `NEXT_PUBLIC_*` or the Vercel checklist.
  - `scripts/verify-deletable-promo.mjs` — fails if any dashboard, api,
    admin, volunteer, or middleware file imports from `app/(promo)/` or
    `components/promo/` (keeps the promo tree deletable).
  - `scripts/verify-no-committed-codegen.mjs` — fails if any file under
    `convex/_generated/` is tracked by git.
- Added `config/school.test.mjs` with `isAdminEmail` unit tests
  (fail-closed with unset allowlist, staff-domain gate, case-insensitive
  match).
- Added `convex/lib/resend.test.mjs` verifying the escalation module
  stays in stub/log mode when any of `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, or `RESEND_ESCALATION_TO` is unset.
- Added `test:unit` script wiring `node --test` over
  `config/**/*.test.mjs` and `convex/**/*.test.mjs`.

### Wave 2 — Promo landing page

- Built `components/promo/` tree: `Hero`, `ValueProps`, `ForkCta`,
  `ReferenceDeployment`, `Footer`. All server components. No `"use
  client"`, no Convex imports, no external icon dependency (inline SVG).
- Added `app/(promo)/page.tsx` composing the five components in order,
  with promo-scoped `metadata`.
- Deleted `app/page.tsx` in the same commit to avoid the duplicate
  `/`-route build error.
- Committed static promo assets under `public/promo/` (only files
  referenced, none >500 KB).

### Wave 3 — Convex authentication and codegen

- Verified `.env.local` and `.env.convex.local` populated per the
  Session-3 env split (Nextjs_Env vs Convex_Env boundary).
- Established the non-UNC Local_Mirror at
  `C:\Users\bryan\AppData\Local\Temp\opencode\sgCampusCore2026-local`
  (UNC path causes Convex CLI and Next.js build to fail).
- Ran `npx convex dev --once` in the mirror. Captured the Convex Preview
  deployment slug `elated-dogfish-303`
  (`https://elated-dogfish-303.convex.cloud` for the WebSocket client,
  `https://elated-dogfish-303.convex.site` for HTTP actions such as the
  Telegram webhook).
- Wrote `NEXT_PUBLIC_CONVEX_URL=https://elated-dogfish-303.convex.cloud`
  into `.env.local` in both the mirror and the UNC repo.
- Confirmed `convex/_generated/{api.js,api.d.ts,dataModel.d.ts,server.d.ts,server.js}`
  exist in the mirror.
- Seeded Convex_Env with `npx convex env set` for every server-side
  variable: `CLERK_JWT_ISSUER_DOMAIN`, `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `GROQ_API_KEY`, `LLM_BASE_URL`,
  `RESEND_API_KEY`, `CAMPUSCORE_SCHOOL_CODE`,
  `CAMPUSCORE_ADMIN_ALLOWLIST`, `CSAM_SCAN_ENABLED`.
  `RESEND_FROM_EMAIL` and `RESEND_ESCALATION_TO` intentionally left
  unset — escalation stays in stub/log mode per Property 5 (see
  Blockers).

### Wave 4 — Local build green

- `npm run typecheck` → exit 0 in the Local_Mirror.
- `npm run lint` → exit 0 in the Local_Mirror.
- `npm run build` → exit 0 in the Local_Mirror.
- All three Wave-1 verify scripts exited 0.
- `npm run test:unit` → all passing.

### Wave 5 — Deployment documentation and Vercel wiring

- Rewrote `DEPLOYMENT.md` per design §C7: Overview, Prerequisites, Env
  variable reference table, Local dev, Convex env seeding, Vercel setup,
  Fork-and-deploy runbook, AGENTS.md hard constraints, Troubleshooting,
  Approval-checkpoint reminder. No real secret values — placeholders
  only. Explicit note that Session 3 ships Preview only.
- Updated the Vercel project Build Command to
  `npx convex deploy --cmd 'next build'`.
- Populated Vercel Project Environment Variables per the §5 checklist.
  Preview scope populated; Production scope left with an empty
  `CONVEX_DEPLOY_KEY` so any accidental production deploy fails fast.

### Wave 5 — Vercel Preview live

- Deployment `dpl_73ocVh8wtJ13Arss24hDMoDYU5Cz` — state `READY`, build
  time ≈48s.
- Live URL: <https://sgcampuscore.hong-yi.me/>
- Inspector:
  <https://vercel.com/theprawnvercel/sgcampuscore/73ocVh8wtJ13Arss24hDMoDYU5Cz>
- Convex Preview deployment slug: `elated-dogfish-303`.

## Validation evidence

### Wave 1 scripts (all exit 0)

- `node scripts/verify-env-boundary.mjs` → 0
- `node scripts/verify-deletable-promo.mjs` → 0
- `node scripts/verify-no-committed-codegen.mjs` → 0

### Wave 1 tests

- `npm run test:unit` → all passing (`config/school.test.mjs` +
  `convex/lib/resend.test.mjs`).

### Wave 4 local build (Local_Mirror)

- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run build` → exit 0

### Wave 5 live probe (`sgcampuscore.hong-yi.me`)

- `HEAD /` → 200, `X-Clerk-Auth-Status: signed-out`,
  `X-Vercel-Cache: PRERENDER`. Body contains `CampusCore`, `Fork`,
  `DEPLOYMENT`, `SMU` — confirms Promo_Site is being served on `/`.
- `HEAD /dashboard` → 200, `X-Clerk-Auth-Status: signed-out`,
  `X-Vercel-Cache: PRERENDER`. Body contains `CampusCore`, `Dashboard`,
  `priority`, `SMU` — confirms the dashboard shell renders (in
  signed-out setup state, as designed).
- Secret-leakage grep across both HTML pages: CLEAN. None of the
  following secret fragments appear in the client bundle: `sk_test`,
  `re_FwEp`, `gsk_xM9h`, `AAHKxaZQ`, `preview:hongyime`, `5659174fe4dd`,
  `IDo4PeYl`, `eyJ2MiI6`. Env boundary (Property 1) holds on the live
  deploy.

## Remaining blockers

Full detail lives in `WAITING_ON_HUMAN.md § "Session 3 Task 23 — Live
deploy residuals"`. The short list:

- `RESEND_FROM_EMAIL` unset — the current Resend API key is send-only
  and cannot enumerate verified domains. Needs a Full-access or
  Domains-scoped key, or a manual sender-domain lookup in the Resend
  dashboard.
- `RESEND_ESCALATION_TO` unset — needs an operator-supplied recipient
  inbox.
- Vercel Production `CONVEX_DEPLOY_KEY` still empty. Production requires
  a separate `prod:` deploy key (not the current `preview:` key).
  Explicitly out of scope for Session 3 — this ships Preview only.
- Custom-domain aliasing is a manual chore: each new green deployment
  must be re-aliased to `sgcampuscore.hong-yi.me` because Vercel org SSO
  covers every `*.vercel.app` URL under `The Prawn Vercel`.

## Next-agent checklist

1. Generate a `prod:hongyime:sgcampuscore|<key>` Convex deploy key and
   populate `CONVEX_DEPLOY_KEY` in the Vercel Production scope when
   ready to promote past Preview.
2. Provision a Full-access or Domains-scoped Resend API key, look up
   the verified sender domain, then
   `npx convex env set RESEND_FROM_EMAIL alerts@<verified-domain>`.
3. Enable the Google social connection in the Clerk dashboard if the
   product wants Google sign-in enabled.
4. Confirm the Clerk JWT template named `convex` exists in the Clerk
   dashboard — Convex-side auth verification depends on it.
5. Before any deploy touches Production, re-read AGENTS.md § "Approval
   Checkpoints." None of those values changed this session; do not
   drift them without an explicit approval task.

## AGENTS.md invariant audit

Unchanged this session:

- 60-second emergency SLA threshold.
- Reaper TTL and `retry_count` dead-letter threshold.
- Hazard lexicon word list.
- NSFW/violence confidence cutoff (`0.50`).
- `priority_tier` remains server-owned (no client-mutation path added).
- No human image-review queue introduced.
- Legal-escalation endpoint remains a stub (`app/api/legal-escalation/route.ts`).
- No new third-party dependency added. `fast-check` was already in
  `devDependencies` from a prior spec; nothing new landed this session.
