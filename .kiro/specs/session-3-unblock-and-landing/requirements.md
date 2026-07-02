# Requirements Document

## Introduction

This spec captures Session 3 of the CampusCore build. Session 2 shipped a
locally validated Next.js + Convex scaffold but was blocked on a single seam:
`convex/_generated/*` did not exist, so `npm run typecheck` and `npm run build`
failed on missing `@/convex/_generated/api` and `@/convex/_generated/dataModel`
imports. The user has now provided a Convex preview-scope deploy key for the
`hongyime/sgcampuscore` project, plus the remaining credentials (Clerk dev
instance, Telegram bot token, Groq key, Resend key, Telegram webhook secret,
school code `smu`, and admin allowlist `bryan.seah.2024@smu.edu.sg`).

Three interlocking outcomes are treated as one coherent feature because they
share the same failing build and the same env-organization decision:

1. **Unblock the build.** Authenticate the Convex CLI with the preview deploy
   key, generate `convex/_generated/`, and get `typecheck`, `lint`, and `build`
   green both locally and on Vercel. Vercel's Build Command must be switched to
   `npx convex deploy --cmd 'next build'` so codegen runs on every deploy.

2. **Landing page + Vercel deploy.** `https://sgcampuscore.hong-yi.me` is being
   used as the promo page for the CampusCore multi-school template, not as the
   SMU app itself. Route `/` must become a marketing landing page (what the
   template is, who it's for, "fork and deploy for your school" CTA, credit to
   the SMU reference deployment). The SMU app (`/dashboard`, `/volunteer`,
   `/admin`, `/api/*`) must remain reachable on the same deployment. The split
   must be clean enough that a fork can delete the promo and keep only the app.

3. **Env organization + documentation.** Two runtimes (Next.js/Vercel and
   Convex) do not share `process.env`, so every variable belongs to exactly one
   of them (with some deliberately mirrored). This spec pins down the split,
   the `NEXT_PUBLIC_*` boundary, the Vercel dashboard checklist, the
   `npx convex env set` sequence, and a `DEPLOYMENT.md` a stranger developer
   can follow to green their own fork.

This feature does not touch any AGENTS.md approval-checkpoint items (60s SLA,
reaper TTL, hazard lexicon, NSFW 0.50 cutoff, third-party dependencies). It
does not add new dependencies. It does not modify the priority_tier write path,
the moderation pipeline, or the legal-escalation stub.

## Glossary

- **CampusCore_Template**: The multi-school application in this repository. One
  code base, deployed once per school; the active school is chosen by the
  `CAMPUSCORE_SCHOOL_CODE` env var. Reference deployment is SMU.
- **Promo_Site**: The marketing landing surface served at route `/` on the
  `sgcampuscore.hong-yi.me` deployment. Describes CampusCore_Template and
  directs prospective schools to fork it.
- **SMU_App**: The functional CampusCore surfaces (`/dashboard`, `/volunteer`,
  `/admin`, `/api/*`) on the same deployment, configured for
  `CAMPUSCORE_SCHOOL_CODE=smu`.
- **Nextjs_Runtime**: The Next.js process, whether local (`next dev`,
  `next build`) or on Vercel. Reads variables from `.env.local` locally and
  from Vercel Project Settings > Environment Variables in the cloud.
- **Convex_Runtime**: The Convex deployment (functions, HTTP actions,
  scheduler). Reads variables set via `npx convex env set` or the Convex
  dashboard. Does NOT read Vercel or `.env.local`.
- **Nextjs_Env**: The variable set defined for Nextjs_Runtime.
- **Convex_Env**: The variable set defined for Convex_Runtime.
- **Public_Var**: A variable whose name begins with `NEXT_PUBLIC_`. Next.js
  inlines these into the browser bundle at build time.
- **Server_Var**: A variable in Nextjs_Env or Convex_Env that is NOT a
  Public_Var. Must never be inlined into the browser bundle.
- **Preview_Deploy_Key**: A Convex deploy key scoped to preview deployments of
  the `hongyime/sgcampuscore` project. Sufficient for `npx convex codegen`,
  `npx convex dev --once`, and `npx convex deploy` against preview.
- **Prod_Deploy_Key**: A separate Convex deploy key with `prod:` scope, not yet
  generated. Required later for Vercel Production; out of scope for this spec.
- **Codegen_Artifacts**: The files under `convex/_generated/` produced by
  `npx convex codegen` or `npx convex deploy`. Includes `api.d.ts`,
  `api.js`, `dataModel.d.ts`, `server.d.ts`, `server.js`.
- **Build_Command**: The command Vercel runs to build the deployment.
- **Admin_Gate**: The middleware check in `middleware.ts` that a request to
  `/admin(.*)` or `/api/admin(.*)` carries a verified staff-domain email
  present on `CAMPUSCORE_ADMIN_ALLOWLIST`. Fails closed (403 when the allowlist
  is empty).
- **UNC_Repo_Path**: The repository as accessed via the UNC-style path
  `x:\01 REPOSITORIES\sgCampusCore2026`. Session 2 recorded that `cmd.exe`
  cannot reliably run npm scripts from this path.
- **Local_Mirror**: A non-UNC working copy of the repository (e.g.
  `C:\Users\bryan\AppData\Local\Temp\opencode\sgCampusCore2026-local`) used
  when npm operations from UNC_Repo_Path are unreliable.
- **Fork_Developer**: A stranger developer at another school who forks
  CampusCore_Template to run their own deployment. The primary reader of
  `DEPLOYMENT.md`.

## Requirements

### Requirement 1: Convex Project Linkage and Codegen

**User Story:** As a maintainer, I want the Convex CLI authenticated with the
provided preview deploy key so that `convex/_generated/` is produced and the
project builds without hand-written stubs.

#### Acceptance Criteria

1. WHEN `CONVEX_DEPLOY_KEY` is set to the Preview_Deploy_Key in the shell
   environment, THE CampusCore_Template SHALL authenticate the Convex CLI
   against the `hongyime/sgcampuscore` project without any interactive prompt.
2. WHEN `npx convex codegen` is invoked with a valid Preview_Deploy_Key in the
   environment, THE Convex_Runtime SHALL produce Codegen_Artifacts under
   `convex/_generated/` in the working copy.
3. THE Codegen_Artifacts SHALL include, at minimum, exports for `api`,
   `internal`, and `Id` such that the imports in `app/dashboard/page.tsx`,
   `components/EmergencyTakeover.tsx`, `app/api/upload/route.ts`, and
   `convex/http.ts` resolve without TypeScript errors.
4. IF `CONVEX_DEPLOY_KEY` is unset OR is not a Convex deploy key, THEN THE
   Convex CLI SHALL fail with a non-zero exit code and SHALL NOT produce
   partial or stale Codegen_Artifacts.
5. THE `convex/_generated/` directory SHALL remain gitignored (existing
   `.gitignore` policy) so Codegen_Artifacts are regenerated per deploy rather
   than committed.
6. WHERE Session 2 observed that npm operations are unreliable on
   UNC_Repo_Path, THE DEPLOYMENT.md SHALL document that codegen may need to be
   run from a Local_Mirror or a mapped drive letter.

### Requirement 2: Local Build Passes Green

**User Story:** As a maintainer, I want `typecheck`, `lint`, and `build` to all
pass locally with the current env so that the repository is in a demonstrably
buildable state before pushing to Vercel.

#### Acceptance Criteria

1. WHEN Codegen_Artifacts exist and Nextjs_Env is populated per Requirement 5,
   THE `npm run typecheck` command SHALL exit with code 0.
2. WHEN the same preconditions hold, THE `npm run lint` command SHALL exit
   with code 0.
3. WHEN the same preconditions hold, THE `npm run build` command SHALL exit
   with code 0 and SHALL produce a `.next/` output directory.
4. IF Codegen_Artifacts are missing, THEN THE `npm run typecheck` command
   SHALL fail with an unambiguous error naming `convex/_generated/api` or
   `convex/_generated/dataModel` as the missing module.
5. THE build SHALL NOT require adding any dependency beyond the approved
   stack listed in AGENTS.md (Convex, Clerk, Next.js/Vercel, Telegram Bot API,
   Cloudflare, ONNX Runtime WASM, Resend).
6. THE build SHALL NOT modify any AGENTS.md approval-checkpoint value (60s SLA,
   reaper TTL, hazard lexicon, NSFW 0.50 cutoff).

### Requirement 3: Vercel Build Command Runs Convex Codegen

**User Story:** As a maintainer, I want every Vercel build to run Convex
codegen so that `convex/_generated/` is fresh on the deployment without needing
to commit generated files.

#### Acceptance Criteria

1. THE Vercel project's Build_Command SHALL be set to
   `npx convex deploy --cmd 'next build'`.
2. WHEN the Vercel build runs with `CONVEX_DEPLOY_KEY` present in the Vercel
   Environment Variables, THE Convex CLI SHALL regenerate Codegen_Artifacts
   before `next build` executes.
3. WHERE the Preview_Deploy_Key is the only key available, THE Vercel Preview
   environment SHALL build successfully AND THE Vercel Production environment
   SHALL be documented as requiring a separately generated Prod_Deploy_Key.
4. IF `CONVEX_DEPLOY_KEY` is missing from a Vercel environment, THEN THE
   Vercel build SHALL fail with a message pointing the operator at DEPLOYMENT.md.
5. THE Vercel build output SHALL include Codegen_Artifacts on the server side
   but SHALL NOT expose any Server_Var to the browser bundle.

### Requirement 4: Environment Variable Separation (Two Runtimes)

**User Story:** As a maintainer, I want each environment variable to have
exactly one owning runtime (with mirrors called out explicitly) so that a
future session or fork does not silently read stale values from the wrong
place.

#### Acceptance Criteria

1. THE DEPLOYMENT.md SHALL list, for every variable in `.env.example`, whether
   it belongs to Nextjs_Env, Convex_Env, or both, with a one-sentence rationale
   for the placement.
2. THE Nextjs_Env SHALL contain: `NEXT_PUBLIC_CONVEX_URL`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CAMPUSCORE_SCHOOL_CODE`, `CAMPUSCORE_ADMIN_ALLOWLIST`,
   `TELEGRAM_WEBHOOK_SECRET`, `CSAM_SCAN_ENABLED`, `NEXT_PUBLIC_APP_URL`, and
   `CONVEX_DEPLOY_KEY` (build-time only).
3. THE Convex_Env SHALL contain: `CLERK_JWT_ISSUER_DOMAIN`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `GROQ_API_KEY`,
   `LLM_BASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
   `RESEND_ESCALATION_TO`, `NSFW_MODEL_URL`, `CAMPUSCORE_SCHOOL_CODE`, and
   `CAMPUSCORE_ADMIN_ALLOWLIST`.
4. WHERE a variable appears in both Nextjs_Env and Convex_Env (currently
   `TELEGRAM_WEBHOOK_SECRET`, `CAMPUSCORE_SCHOOL_CODE`, and
   `CAMPUSCORE_ADMIN_ALLOWLIST`), THE DEPLOYMENT.md SHALL flag the mirroring
   requirement and state which runtime reads each mirrored value.
5. THE Public_Var set exposed to the browser bundle SHALL be exactly
   `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and
   `NEXT_PUBLIC_APP_URL`. No other variable SHALL be prefixed
   `NEXT_PUBLIC_` (correctness property: no Server_Var is exposed to the
   client).
6. THE `TELEGRAM_BOT_TOKEN`, `CLERK_SECRET_KEY`, `RESEND_API_KEY`,
   `GROQ_API_KEY`, and `CONVEX_DEPLOY_KEY` SHALL NEVER appear in the browser
   bundle (correctness property, enforced by name prefix and by
   `.gitignore`-scoped storage).
7. IF `RESEND_API_KEY` is set but `RESEND_FROM_EMAIL` OR `RESEND_ESCALATION_TO`
   is unset, THEN THE Convex_Runtime escalation module SHALL stay in stub/log
   mode (existing Session 2 behavior; do not regress).
8. WHERE `CSAM_SCAN_ENABLED` is unset, THE Nextjs_Runtime SHALL treat the
   value as `false` (existing behavior in `app/api/upload/route.ts`; do not
   regress).

### Requirement 5: Vercel Environment Variables Checklist

**User Story:** As the human operator, I want an exact list of Vercel Project
Environment Variables to paste into the dashboard so that no Vercel build
fails for a missing var and no secret is placed in the wrong scope.

#### Acceptance Criteria

1. THE DEPLOYMENT.md SHALL contain a table naming every variable required in
   Vercel Project Environment Variables, its scope (Production, Preview,
   Development), and whether the value is a secret.
2. THE checklist SHALL mark `CLERK_SECRET_KEY`, `CONVEX_DEPLOY_KEY`, and
   `TELEGRAM_WEBHOOK_SECRET` as Secret-scoped variables.
3. THE checklist SHALL note that `CONVEX_DEPLOY_KEY` in Vercel Preview must be
   the Preview_Deploy_Key, and that Vercel Production requires a separately
   generated Prod_Deploy_Key which is out of scope for this session.
4. WHERE a variable is a Public_Var (per Requirement 4.5), THE checklist SHALL
   flag it as safe for the browser bundle.
5. IF a value is not yet chosen (e.g. `NSFW_MODEL_URL`), THEN THE checklist
   SHALL mark it explicitly as "leave unset" and reference WAITING_ON_HUMAN.md
   for the follow-up.
6. THE checklist SHALL NOT list any variable whose owning runtime is
   Convex_Runtime only (per Requirement 4.3), except for the mirrored
   variables in Requirement 4.4.

### Requirement 6: Convex Environment Seeding Commands

**User Story:** As the human operator, I want a copy-pasteable, idempotent
sequence of `npx convex env set` commands so that seeding the Convex
deployment is one paste, not a hunt through docs.

#### Acceptance Criteria

1. THE DEPLOYMENT.md SHALL provide an ordered list of `npx convex env set
   <KEY> <VALUE_PLACEHOLDER>` commands covering every variable in Convex_Env
   (per Requirement 4.3).
2. THE placeholder for each secret value SHALL be a bracketed, obviously-fake
   token (e.g. `<TELEGRAM_BOT_TOKEN>`), and the DEPLOYMENT.md SHALL NOT
   contain any real secret value.
3. WHEN a command from the list is re-run with the same value, THE Convex_Env
   SHALL end in the same state as after the first run (idempotence property).
4. IF a Convex_Env variable required by a Convex function (per §4.3) is unset
   at function-call time, THEN THE function SHALL fail closed with a
   descriptive error rather than falling back to a placeholder or empty
   string.
5. THE command list SHALL include the two mirrored variables from Requirement
   4.4 that Convex reads (`CAMPUSCORE_SCHOOL_CODE`,
   `CAMPUSCORE_ADMIN_ALLOWLIST`, `TELEGRAM_WEBHOOK_SECRET`) even though they
   are also in Vercel.

### Requirement 7: Promo Landing Page at Route /

**User Story:** As a prospective Fork_Developer visiting
`sgcampuscore.hong-yi.me`, I want the landing page to explain what
CampusCore_Template is and how I fork it so that I can decide whether to
deploy it for my own school.

#### Acceptance Criteria

1. WHEN a browser requests `GET /` on the `sgcampuscore.hong-yi.me`
   deployment, THE Promo_Site SHALL respond with a marketing landing page
   describing CampusCore_Template.
2. THE Promo_Site SHALL state that CampusCore_Template is a multi-school
   template that each school community can fork and deploy independently.
3. THE Promo_Site SHALL include a call-to-action linking to the source
   repository and to `DEPLOYMENT.md` for fork instructions.
4. THE Promo_Site SHALL credit the SMU reference deployment and link into it
   at `/dashboard` so a visitor can see the app running.
5. THE Promo_Site SHALL NOT depend on Convex_Runtime being reachable; it
   SHALL render even when `NEXT_PUBLIC_CONVEX_URL` is unset.
6. THE Promo_Site SHALL NOT display an authenticated dashboard, ticket data,
   or admin controls.
7. THE Promo_Site content SHALL live under a directory (e.g. `app/(promo)/`
   or `components/promo/`) that a Fork_Developer can delete in a single
   commit without breaking SMU_App routes.

### Requirement 8: SMU App Remains Reachable

**User Story:** As an SMU user, I want the functional CampusCore app to remain
reachable on the same deployment so that the reference deployment continues to
work while the promo page lives at `/`.

#### Acceptance Criteria

1. WHEN a browser requests `GET /dashboard`, THE SMU_App SHALL render the
   dashboard shell (Convex-configured or setup-required state, per existing
   Session 2 behavior).
2. WHEN a browser requests `GET /volunteer` OR `GET /admin`, THE SMU_App
   SHALL enforce the existing Clerk middleware checks defined in
   `middleware.ts`.
3. WHEN a Telegram request hits `POST /api/upload` OR
   `POST /api/legal-escalation`, THE SMU_App API routes SHALL respond as they
   did in Session 2 (no behavior change to `priority_tier` writes, moderation
   pipeline, or the legal-escalation console.log stub).
4. THE promo/app split SHALL NOT introduce a new API route, a new middleware
   matcher, or a change to the Admin_Gate logic.
5. IF a route conflict is possible between the promo layout and an SMU_App
   route, THEN THE SMU_App route SHALL take precedence (a promo layout SHALL
   NOT wrap `/dashboard`, `/volunteer`, `/admin`, or `/api/*`).

### Requirement 9: Admin Gate Fails Closed (Correctness Property)

**User Story:** As a security-conscious maintainer, I want the Admin_Gate to
remain fail-closed across the environment reorganization so that a
misconfiguration cannot grant admin access to anyone with a staff-domain
email.

#### Acceptance Criteria

1. WHEN `CAMPUSCORE_ADMIN_ALLOWLIST` is unset OR is an empty string in
   Nextjs_Env, THE Admin_Gate SHALL respond to any `/admin(.*)` or
   `/api/admin(.*)` request with HTTP 403 for every authenticated user,
   including staff-domain accounts (fail-closed property, from
   `config/school.ts`).
2. WHEN `CAMPUSCORE_ADMIN_ALLOWLIST` contains one or more addresses, THE
   Admin_Gate SHALL grant access only to a request whose verified Clerk
   session-claim email is (a) on a `staffDomains` entry for the active
   school AND (b) equal (case-insensitive) to an address on the allowlist.
3. IF the active school code in `CAMPUSCORE_SCHOOL_CODE` does not match any
   entry in `SCHOOL_REGISTRY`, THEN THE Admin_Gate SHALL fall back to the
   default school defined in `config/school.ts` AND SHALL still evaluate the
   allowlist against that default school's `staffDomains`.
4. THE Admin_Gate SHALL never log the full Clerk session JWT (AGENTS.md PII
   rule); it SHALL only read the email claim.
5. THE Admin_Gate SHALL preserve the fail-closed property across all three
   deployment surfaces (local `next dev`, Vercel Preview, Vercel Production).

### Requirement 10: Secrets Never Committed

**User Story:** As a maintainer, I want the repository's git state to never
contain real secrets or generated artifacts so that a public push does not
leak credentials or ship stale codegen.

#### Acceptance Criteria

1. THE `.gitignore` SHALL cover `.env`, `.env*.local`, `node_modules/`,
   `.next/`, `.convex/`, `convex/_generated/`, and `.omo/` (existing Session
   2 policy; do not regress).
2. WHEN `git status` is run in a clean checkout after codegen, THE output
   SHALL NOT list `.env.local`, `.env.convex.local`, `node_modules`,
   `.next`, `.convex`, `.omo`, or `convex/_generated/` as tracked or staged.
3. THE `.env.example` SHALL remain committed and SHALL contain no real
   secret values.
4. THE DEPLOYMENT.md SHALL contain no real secret values, no live keys, and
   no live tokens; it SHALL contain only placeholders and command shapes.
5. IF a Session 3 code change would require committing a real secret to
   pass, THEN THE change SHALL be flagged in WAITING_ON_HUMAN.md and NOT
   committed.

### Requirement 11: DEPLOYMENT.md as the Fork Runbook

**User Story:** As a Fork_Developer at another Singapore school, I want a
single deployment document I can follow end-to-end so that I can get my own
fork's Vercel deployment green without asking the original maintainer.

#### Acceptance Criteria

1. THE DEPLOYMENT.md SHALL contain a "Fork and Deploy" section that walks a
   Fork_Developer from `git clone` to a green Vercel Preview.
2. THE runbook SHALL list, in order, the human-only prerequisite steps:
   creating a Convex project, generating a Preview_Deploy_Key, creating a
   Clerk application, restricting the Clerk instance to the fork's school
   domains, and creating a Vercel project.
3. THE runbook SHALL reference `SCHOOL_REGISTRY` in
   `config/schoolRegistry.ts` for the set of currently supported
   `CAMPUSCORE_SCHOOL_CODE` values and SHALL note that domains marked
   `// verify` need confirmation against the school's IT.
4. THE runbook SHALL point at `WAITING_ON_HUMAN.md` for any credential or
   dashboard action not scriptable from code.
5. THE runbook SHALL state the AGENTS.md hard constraints that a fork MUST
   preserve (no client writes to `priority_tier`, no human image-review
   queue, legal-escalation stays a console-log stub, approval-checkpoint
   values require sign-off).
6. WHEN a Fork_Developer follows the runbook against a fresh Convex + Clerk
   + Vercel account set, THE resulting Vercel Preview SHALL build green on
   the first deploy attempt (acceptance property, verified manually in a
   later session).

### Requirement 12: Vercel Deploy Green

**User Story:** As the human operator, I want the current Vercel error on
`sgcampuscore.hong-yi.me` cleared so that the promo page and the SMU app are
both live on the same deployment.

#### Acceptance Criteria

1. WHEN the Vercel Preview build runs with the checklist from Requirement 5
   fully applied, THE Vercel build SHALL exit with status "Ready".
2. WHEN the deploy is Ready, THE `GET /` request SHALL return the
   Promo_Site (per Requirement 7).
3. WHEN the deploy is Ready, THE `GET /dashboard` request SHALL return the
   SMU_App dashboard shell (per Requirement 8).
4. IF a Vercel build error surfaces during Session 3 that is neither
   Codegen_Artifacts-related nor env-related, THEN THE error SHALL be
   diagnosed and resolved within the scope of this feature (this includes
   broken imports, missing metadata, missing static assets, and layout
   errors introduced by the promo split).
5. THE promo/app split SHALL NOT introduce a redirect loop between `/` and
   `/dashboard`.

### Requirement 13: Session 3 Scope Guard

**User Story:** As the maintainer, I want an explicit statement of what this
feature does NOT change so that a well-meaning agent does not silently expand
scope into approval-checkpoint territory.

#### Acceptance Criteria

1. THE Session 3 implementation SHALL NOT modify the 60-second emergency SLA
   threshold, the reaper TTL, the `retry_count` dead-letter threshold, the
   hazard lexicon word list, or the NSFW/violence confidence cutoff.
2. THE Session 3 implementation SHALL NOT add any third-party dependency
   beyond the approved stack (Convex, Clerk, Next.js/Vercel, Telegram Bot
   API, Cloudflare, ONNX Runtime WASM, Resend).
3. THE Session 3 implementation SHALL NOT introduce a human image-review
   queue, a `pending_review` state, or any UI that surfaces a flagged image
   to a human reviewer.
4. THE Session 3 implementation SHALL NOT wire the legal-escalation route
   to any real recipient; the route SHALL continue to console.log the
   payload and return `{ ok: true, stub: true }`.
5. THE Session 3 implementation SHALL NOT allow any client-facing mutation
   to write `priority_tier`; that field remains server-owned by the
   ingestion-time lexicon check.
6. IF a Session 3 change would touch any of the above, THEN THE change
   SHALL be halted and escalated via WAITING_ON_HUMAN.md rather than
   merged.
