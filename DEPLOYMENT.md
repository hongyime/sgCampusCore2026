<!--
DEPLOYMENT.md — CampusCore fork-and-deploy runbook.

Do NOT put real secret values in this file. Every value below is either
an obviously-fake placeholder (e.g. <TELEGRAM_BOT_TOKEN>) or a public
identifier (e.g. a Vercel Build Command). Real values live only in the
operator's `.env.local`, `.env.convex.local`, the Convex dashboard, and
the Vercel Project Settings — never in git.

Section outline follows session-3-unblock-and-landing design §C7.
-->

# DEPLOYMENT.md — CampusCore Fork-and-Deploy Runbook

> This file is the fork developer's runbook. It walks a stranger from
> `git clone` to a green Vercel Preview, with an env-variable ownership
> table that names, for each variable, which of the two runtimes
> (Next.js/Vercel vs. Convex) owns it. Keep the two runtimes distinct in
> your head — they do not share `process.env`.
>
> **Scope note (Session 3).** This session ships **Preview only**.
> Vercel Production requires a separately generated Convex `prod:` deploy
> key that has not been issued yet. Do not populate the Vercel Production
> scope until that key exists — see the "Approval-checkpoint reminder"
> section at the end and the matching item in `WAITING_ON_HUMAN.md`.

## Overview

CampusCore is a decentralized campus issue-reporting network deployable
per school. One code base, one deployment per school, and one active
school per deployment (selected by `CAMPUSCORE_SCHOOL_CODE`). The
reference deployment at `sgcampuscore.hong-yi.me` doubles as a promo page
at route `/` for the multi-school template, with the SMU app itself on
`/dashboard`, `/volunteer`, `/admin`, and `/api/*`.

The architecture has two independent runtimes:

- **Next.js runtime** — the app (Vercel in the cloud, `next dev`
  locally). Reads `.env.local` (dev) or Vercel Project Environment
  Variables (cloud). Every browser-visible variable in this runtime
  starts with `NEXT_PUBLIC_`.
- **Convex runtime** — the backend (functions, HTTP actions, scheduler).
  Reads values set via `npx convex env set`. Ignores `.env.local` and
  Vercel entirely.

A small set of variables is deliberately **mirrored** into both runtimes
because both sides read them (details in the reference table below).
Every other variable belongs to exactly one runtime. That single split is
the organizing decision this document exists to make legible.

Fork developers: skim this Overview, work through Prerequisites and Local
Development Setup, then run the Convex Seeding and Vercel Setup sections
in order. The Fork-and-Deploy Runbook at the end folds those steps into a
per-school checklist.

## Prerequisites

Create these accounts before touching the repo. Each is on a free tier as
listed in `AGENTS.md`; do not swap for paid tiers or new vendors without
an AGENTS.md-scoped approval.

1. **GitHub** — fork of `github.com/bryanseah234/sgCampusCore2026`. The
   fork is the source of truth Vercel builds from.
2. **Convex** — one project per school (deploy keys, function hosting,
   scheduler). Generate a **Preview** deploy key (`preview:` prefix) for
   this session. A **Production** deploy key (`prod:` prefix) is a
   separate, later step (see WAITING_ON_HUMAN.md).
3. **Clerk** — one instance per school. Configure the instance's dashboard
   to restrict signups to that school's staff/student domain(s). Clerk
   dashboard-level domain restriction is the **authoritative** admin gate;
   the middleware in `middleware.ts` is defense-in-depth.
4. **Vercel** — one project per school, linked to the GitHub fork.
5. **Telegram** — a bot created via `@BotFather` for that school's
   channel. You will hold the bot token as a secret.
6. **Groq** — an API key for the LLM triage call (or a local Ollama URL if
   you prefer to self-host).
7. **Resend** — an API key for the emergency escalation email path (free
   tier, 3,000 emails/month). Optional at boot: the escalation module
   stays in stub/log mode until you set the full trio of Resend
   variables.
8. **Cloudflare** *(optional at boot)* — required only if you intend to
   enable image-upload CSAM scanning. See WAITING_ON_HUMAN.md for the
   orange-cloud + tool-enable steps; keep `CSAM_SCAN_ENABLED=false` until
   the zone is genuinely proxied.

You do not need any paid tier of any of the above to bring up a green
Vercel Preview.

## Environment variable reference

Every variable in `.env.example` belongs to exactly one owning runtime —
except three that are **mirrored** into both because both runtimes read
them. The full table:

| Variable                          | Nextjs_Env      | Convex_Env      | Public? | Sensitive? | Rationale                                                                                                                                     |
| --------------------------------- | --------------- | --------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`          | ✅              | —               | ✅      | No         | Convex WebSocket URL; browser needs it to open the Convex subscription.                                                                       |
| `CONVEX_DEPLOY_KEY`               | ✅ (build only) | —               | No      | ✅         | Passed to `npx convex deploy` inside the Vercel Build Command. Build-time only; never exposed at runtime.                                     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`| ✅              | —               | ✅      | No         | Clerk widget bootstrap. Safe by design.                                                                                                       |
| `CLERK_SECRET_KEY`                | ✅              | —               | No      | ✅         | Server-side Clerk operations (`auth()` in middleware and route handlers).                                                                     |
| `CLERK_JWKS_URL`                  | ✅ (optional)   | —               | No      | No         | Not currently read by app code. Kept for future direct JWT verification if the Convex Clerk provider is bypassed.                             |
| `CLERK_JWT_ISSUER_DOMAIN`         | —               | ✅              | No      | No         | Read by `convex/auth.config.ts` to verify Clerk JWTs against JWKS. Convex-only.                                                               |
| `TELEGRAM_BOT_TOKEN`              | —               | ✅              | No      | ✅         | Convex actions call the Telegram Bot API with this. Never in Nextjs_Env; never in the browser bundle.                                         |
| `TELEGRAM_WEBHOOK_SECRET`         | ✅ (mirror)     | ✅ (mirror)     | No      | ✅         | Convex `http.ts` verifies the header; Next `/api/upload` uses it as the callback secret. Mirrored so both sides produce/accept the same value.|
| `GROQ_API_KEY`                    | —               | ✅              | No      | ✅         | Only Convex actions call Groq (LLM triage).                                                                                                   |
| `LLM_BASE_URL`                    | —               | ✅              | No      | No         | Groq or Ollama base URL used by the same Convex triage action.                                                                                |
| `RESEND_API_KEY`                  | —               | ✅              | No      | ✅         | Only the Convex escalation action sends via Resend.                                                                                           |
| `RESEND_FROM_EMAIL`               | —               | ✅              | No      | No         | Same Convex path. Escalation stays in stub mode until this is set.                                                                            |
| `RESEND_ESCALATION_TO`            | —               | ✅              | No      | No         | Same Convex path. Escalation stays in stub mode until this is set.                                                                            |
| `NSFW_MODEL_URL`                  | —               | ✅              | No      | No         | Consumed by `convex/lib/nsfwScorer.ts` if/when the WASM model is loaded from a URL. Leave unset until the URL is chosen (WAITING_ON_HUMAN.md).|
| `CAMPUSCORE_SCHOOL_CODE`          | ✅ (mirror)     | ✅ (mirror)     | No      | No         | `config/school.ts` runs in both runtimes; both need the same active-school code. Must match a `code` in `config/schoolRegistry.ts`.           |
| `CAMPUSCORE_ADMIN_ALLOWLIST`      | ✅ (mirror)     | ✅ (mirror)     | No      | No         | Middleware Admin_Gate reads it in Nextjs_Env; Convex admin-only mutations read it in Convex_Env. Empty string = no admins (fail-closed).      |
| `CSAM_SCAN_ENABLED`               | ✅              | —               | No      | No         | Read only in `app/api/upload/route.ts`. Keep `false` until the Cloudflare zone is genuinely orange-clouded (WAITING_ON_HUMAN.md).              |
| `NEXT_PUBLIC_APP_URL`             | ✅              | —               | ✅      | No         | Absolute base URL for Clerk redirects and promo CTAs.                                                                                          |
| `CLOUDFLARE_UPLOAD_ENDPOINT`      | ✅ (optional)   | —               | No      | No         | Not currently consumed in code; documented for the future Mini-App bridge.                                                                    |
| `CSOC_INTAKE_EMAIL`               | —               | ✅ (optional)   | No      | No         | Legacy alias for `RESEND_ESCALATION_TO`. Prefer `RESEND_ESCALATION_TO`; keep `CSOC_INTAKE_EMAIL` unset in new deployments.                     |

Placement rules that fall out of the table:

- **The Public_Var set is exactly** `NEXT_PUBLIC_CONVEX_URL`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`. No other
  variable in this repo is or should be prefixed `NEXT_PUBLIC_`. The
  script `scripts/verify-env-boundary.mjs` enforces this.
- **Bot tokens, API keys, and secret keys never leave their owning
  runtime.** `TELEGRAM_BOT_TOKEN`, `GROQ_API_KEY`, `RESEND_API_KEY`,
  `CLERK_SECRET_KEY`, and `CONVEX_DEPLOY_KEY` (build-only) must never
  appear in a browser bundle.
- **Mirrored variables must have the same value in both runtimes.** A
  mismatch on `TELEGRAM_WEBHOOK_SECRET`, `CAMPUSCORE_SCHOOL_CODE`, or
  `CAMPUSCORE_ADMIN_ALLOWLIST` is a misconfiguration, not a design. See
  Troubleshooting for the symptoms.

Where to get each value:

- Convex URL and deploy key — Convex dashboard → Project Settings →
  Deploy keys.
- Clerk keys and JWT issuer domain — Clerk dashboard → API Keys and
  Clerk dashboard → JWT Templates.
- Telegram bot token — `@BotFather` in Telegram.
- Telegram webhook secret — you invent it and pass it to
  `setWebhook` as `secret_token`; store the same string in both runtimes.
- Groq API key — `console.groq.com`.
- Resend API key — `resend.com/api-keys`.

## Local development setup

Steps assume a fresh clone on a machine with Node 20+, npm 10+, and git.

1. `git clone <fork-url> sgCampusCore2026 && cd sgCampusCore2026`
2. `cp .env.example .env.local` and populate the Next.js-side keys per
   the Reference Table above. Leave `NEXT_PUBLIC_CONVEX_URL` blank for
   now — Convex prints it in the next step.
3. Create a sibling `.env.convex.local` (not committed) holding the
   Convex-side values plus `CONVEX_DEPLOY_KEY`. The file exists solely to
   feed values to `npx convex env set` and to authenticate the CLI; the
   Convex runtime does not read this file directly.
4. `npm ci --no-audit --no-fund`
5. Ensure `CONVEX_DEPLOY_KEY` is exported into the current shell:

   ```powershell
   # Windows PowerShell
   $env:CONVEX_DEPLOY_KEY = "<PREVIEW_DEPLOY_KEY>"
   ```

   ```bash
   # macOS / Linux / WSL
   export CONVEX_DEPLOY_KEY=<PREVIEW_DEPLOY_KEY>
   ```

6. `npx convex dev --once` — this authenticates the CLI, pushes the
   local Convex functions to the deployment referenced by the deploy
   key, writes `convex/_generated/*` into your working copy, and prints
   the deployment URL. Copy the printed URL into `.env.local` as
   `NEXT_PUBLIC_CONVEX_URL`.
7. Seed the Convex-side environment (see the next section).
8. Verify the local build is green:

   ```powershell
   npm run typecheck
   npm run lint
   npm run build
   npm run test:unit
   ```

9. `npm run dev` opens the app at `http://localhost:3000`. `/` is the
   promo landing; `/dashboard`, `/volunteer`, `/admin` are the SMU app
   routes.

### UNC / network-share caveat

Session 2 recorded that `cmd.exe` cannot reliably run npm scripts from a
UNC-style path such as `x:\01 REPOSITORIES\sgCampusCore2026` (share
mapped as an X:-drive alias). If codegen or npm scripts fail with EPERM,
`ENOENT`, or half-extracted `node_modules`, work from a **Local_Mirror**
on a local disk instead — for example:

```powershell
robocopy "x:\01 REPOSITORIES\sgCampusCore2026" "C:\Users\<you>\AppData\Local\Temp\sgCampusCore2026-local" /MIR /XD node_modules .next .git .omo .convex convex\_generated
```

Then run all `npm` and `npx convex` commands from the local copy. Vercel
never touches UNC — it clones directly from GitHub and runs the Build
Command in its own POSIX filesystem.

## Convex deployment env seeding

Run these commands **once per school-specific Convex deployment**, from
the Local_Mirror (or wherever `npx convex` runs reliably), with
`CONVEX_DEPLOY_KEY` exported in your shell. Every value is a placeholder;
substitute the real value from your own dashboards before running the
command. The list is idempotent — re-running with the same value is a
no-op.

```powershell
# Clerk — Convex reads the issuer domain when verifying Clerk JWTs.
npx convex env set CLERK_JWT_ISSUER_DOMAIN <CLERK_JWT_ISSUER_DOMAIN>

# Telegram — bot token stays server-only; the webhook secret is mirrored
# into Nextjs_Env as well.
npx convex env set TELEGRAM_BOT_TOKEN <TELEGRAM_BOT_TOKEN>
npx convex env set TELEGRAM_WEBHOOK_SECRET <TELEGRAM_WEBHOOK_SECRET>

# LLM triage.
npx convex env set GROQ_API_KEY <GROQ_API_KEY>
npx convex env set LLM_BASE_URL <LLM_BASE_URL>

# Resend — leave FROM/TO unset to keep escalation in stub/log mode until
# a real inbox is available (see WAITING_ON_HUMAN.md).
npx convex env set RESEND_API_KEY <RESEND_API_KEY>
# npx convex env set RESEND_FROM_EMAIL <RESEND_FROM_EMAIL>
# npx convex env set RESEND_ESCALATION_TO <RESEND_ESCALATION_TO>

# Per-school template — these are mirrored into Nextjs_Env as well.
npx convex env set CAMPUSCORE_SCHOOL_CODE <SCHOOL_CODE>
npx convex env set CAMPUSCORE_ADMIN_ALLOWLIST <ALLOWLIST_CSV>

# Image moderation — leave NSFW_MODEL_URL unset until a hosting URL is
# chosen (see WAITING_ON_HUMAN.md).
# npx convex env set NSFW_MODEL_URL <NSFW_MODEL_URL>
```

After running the set, verify with:

```powershell
npx convex env list
```

Every key above (except the intentionally unset ones) should be
present. Fail-closed behavior for any missing Convex-side key is
documented in `convex/` module code: functions that require the value
error out with a descriptive message rather than falling back to an
empty string.

## Vercel setup

The Vercel project is the Next.js runtime for this school's deployment.
Everything here is a Vercel-dashboard action; nothing in this section
lives in the repo.

1. **Create the Vercel project** and connect it to the GitHub fork.
2. **Build Command** — set to exactly:

   ```text
   npx convex deploy --cmd 'next build'
   ```

   This is the mechanism that keeps `convex/_generated/*` out of git: on
   every Vercel build, the Convex CLI regenerates the codegen against the
   deployment referenced by `CONVEX_DEPLOY_KEY` and then invokes
   `next build`. If `CONVEX_DEPLOY_KEY` is missing from the scope's env,
   the CLI exits non-zero **before** `next build` runs, so no build ever
   ships stale or missing codegen.

3. **Install Command** — leave the Vercel default (`npm ci`).
4. **Output Directory** — leave the Vercel default (`.next`).
5. **Node Version** — Vercel default (Node 20) is what Next 15 + React 19
   need; no override.
6. **Environment Variables** — set the following on the **Preview** and
   **Development** scopes. Every entry names a variable that the Next.js
   runtime reads. Convex-only variables (the LLM keys, the Telegram bot
   token, the Resend keys, the Clerk JWT issuer domain, and the NSFW
   model URL) do **not** belong here — they are seeded via the Convex
   commands above.

   | Variable                            | Scope(s)              | Secret? | Notes                                                                                              |
   | ----------------------------------- | --------------------- | ------- | -------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_CONVEX_URL`            | Preview, Development  | No      | Deployment URL printed by `npx convex dev`. Public — inlined into the browser bundle.               |
   | `CONVEX_DEPLOY_KEY`                 | Preview               | ✅      | The `preview:` deploy key for the school's Convex project. Build-time only; never runtime.          |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Preview, Development  | No      | Clerk publishable key. Public.                                                                      |
   | `CLERK_SECRET_KEY`                  | Preview, Development  | ✅      | Clerk secret. Never in the browser.                                                                 |
   | `CLERK_JWKS_URL`                    | Preview, Development  | No      | Optional; kept for future direct JWT verification.                                                  |
   | `CAMPUSCORE_SCHOOL_CODE`            | Preview, Development  | No      | Mirrored — must match the value seeded on the Convex side. Must match a `code` in `SCHOOL_REGISTRY`.|
   | `CAMPUSCORE_ADMIN_ALLOWLIST`        | Preview, Development  | No      | Mirrored — must match the value seeded on the Convex side. Empty = no admins (fail-closed).         |
   | `TELEGRAM_WEBHOOK_SECRET`           | Preview, Development  | ✅      | Mirrored — must match the value seeded on the Convex side.                                          |
   | `CSAM_SCAN_ENABLED`                 | Preview, Development  | No      | Keep `false` until the Cloudflare upload zone is genuinely orange-clouded (WAITING_ON_HUMAN.md).    |
   | `NEXT_PUBLIC_APP_URL`               | Preview, Development  | No      | Absolute base URL of this deployment (Preview URL or the custom domain).                            |
   | `CLOUDFLARE_UPLOAD_ENDPOINT`        | Preview, Development  | No      | Optional; leave unset until the Cloudflare zone is configured.                                      |

   **Placeholder policy.** Never paste a real value into this document.
   The values above are set in the Vercel dashboard directly and read
   only by the Vercel build.

7. **Production scope** — leave `CONVEX_DEPLOY_KEY` unset in Production
   for now. Vercel Production requires a separately generated Convex
   `prod:` deploy key that has not been issued this session. This is a
   deliberate fail-fast: the Build Command will exit non-zero on any
   Production deploy attempt until the `prod:` key is provisioned (see
   WAITING_ON_HUMAN.md). Preview and Development scopes are fully
   configured; that is what this session ships.
8. **Custom domain** — connect the school's domain to the Vercel
   project. For the SMU reference deployment this is
   `sgcampuscore.hong-yi.me`. Vercel handles TLS.
9. **Deploy** — push a branch or open a Pull Request. The first Preview
   build against a correctly-populated env should exit Ready with the
   promo page at `/` and the SMU app at `/dashboard`.

## Fork-and-deploy runbook for other schools

This is the shortest path from "I want to run CampusCore for `<school>`"
to "the fork has a green Vercel Preview." Follow it top-to-bottom.

1. **Confirm your school code exists.** Check the `SCHOOL_REGISTRY`
   export in `config/schoolRegistry.ts`. Currently supported codes
   (case-insensitive): `smu`, `nus`, `ntu`, `sutd`, `sit`, `suss`, `np`,
   `sp`, `tp`, `nyp`, `rp`, `ite`, and `moe-school` (the generic Student
   iCON entry). If your school is not listed, add a `SchoolEntry` in the
   same PR and populate `studentDomains` and `staffDomains` from the
   school's own IT documentation.
2. **Verify the student subdomain.** Several entries in
   `SCHOOL_REGISTRY` carry a `// verify` comment on `studentDomains`
   because the exact subdomain drifts and could not be independently
   confirmed by the original author. Independently confirm your school's
   student subdomain against the school IT portal or a current student
   account, then remove the `// verify` comment and populate the
   `verified` block on that entry (`{ at, by, source }` per the
   `SchoolEntry` shape) in the same PR. See WAITING_ON_HUMAN.md for the
   list of entries still pending verification.
3. **Create a Clerk instance for the school.** In the Clerk dashboard,
   restrict signups to that school's staff and student domains at the
   dashboard level. Clerk dashboard-level domain restriction is the
   authoritative gate; middleware is defense-in-depth. Do not skip this
   step because middleware is in place.
4. **Create a Convex project for the school** and generate a Preview
   deploy key (`preview:` prefix).
5. **Fork the repo on GitHub**, then follow the Local Development Setup
   above to reach a green local build.
6. **Seed the Convex environment** by running the ordered
   `npx convex env set` sequence in the previous section, substituting
   your school's real values for the `<PLACEHOLDER>` tokens. Set
   `CAMPUSCORE_SCHOOL_CODE` to your school's code from `SCHOOL_REGISTRY`
   in **both** the Convex environment and the Vercel environment (they
   are mirrored).
7. **Set `CAMPUSCORE_ADMIN_ALLOWLIST`** to a comma-or-space-separated
   list of admin staff-domain emails, in **both** runtimes. Empty means
   no admin (fail-closed) — the middleware refuses `/admin(.*)` for every
   authenticated user until at least one address is on the list.
8. **Create the Vercel project** for your fork and follow the Vercel
   Setup section above. Add the Preview `CONVEX_DEPLOY_KEY`; leave
   Production unset until you generate a `prod:` deploy key.
9. **Trigger the first Preview build.** Vercel invokes
   `npx convex deploy --cmd 'next build'`; Convex codegen regenerates
   `convex/_generated/*`; `next build` succeeds. The Preview URL serves
   the promo landing at `/` and your school's SMU-equivalent app on
   `/dashboard`, `/volunteer`, `/admin`, and `/api/*`.
10. **Optional — delete the promo landing.** If your fork is
    school-only and you do not want to run the CampusCore template promo
    page at `/`, remove the directories
    `app/(promo)/` and `components/promo/` in a single commit, and
    restore a plain `app/page.tsx` (or redirect `/` to `/dashboard`).
    Nothing under `app/dashboard/`, `app/volunteer/`, `app/admin/`, or
    `app/api/` imports from those promo paths; the split is deliberately
    deletable.

## AGENTS.md hard constraints

Every fork **must** preserve the following invariants. They are approval
checkpoints in `AGENTS.md`; a fork that breaks any of them is no longer
CampusCore and should not be operated under this template.

- **`priority_tier` is server-owned.** No client-facing mutation writes
  it. The field is set exclusively by the ingestion-time lexicon check
  in the Convex runtime. Do not introduce a client-facing mutation that
  accepts or produces a `priority_tier` argument.
- **No human image-review queue.** The moderation pipeline outcomes are
  `broadcast` or `removed` — hash-match → ONNX WASM binary classifier →
  auto-decide. There is no `pending_review` state, no admin UI showing
  flagged images, and no per-user review log outside the pipeline's own
  internal audit path.
- **Legal escalation stays a stub.** `app/api/legal-escalation/route.ts`
  console-logs the payload and returns `{ ok: true, stub: true }`. Do
  not wire it to a real intake address without a separate, explicit,
  human-approved task.
- **Approval-checkpoint values require explicit human sign-off.** The
  60-second emergency SLA threshold, the reaper TTL and `retry_count`
  dead-letter threshold, the hazard lexicon word list, and the
  NSFW/violence confidence cutoff have been tuned against specific
  platform limits. Do not change them from a fork PR alone.
- **No new third-party dependency.** The approved stack is Convex,
  Clerk, Next.js/Vercel, Telegram Bot API, Cloudflare, ONNX Runtime
  WASM, and Resend. Anything else needs an AGENTS.md-scoped approval,
  including alternative test runners, alternative ML runtimes, and
  alternative email providers.

## Troubleshooting

**Symptom: `Cannot find module '@/convex/_generated/api'` on `npm run typecheck` or `npm run build`.**
`convex/_generated/*` is gitignored and produced by codegen. Run
`npx convex dev --once` in the Local_Mirror after exporting
`CONVEX_DEPLOY_KEY`; that regenerates the directory. If the codegen file
already exists but is stale, delete `convex/_generated/` and re-run.

**Symptom: Vercel build fails with a Convex authentication error.**
`CONVEX_DEPLOY_KEY` is missing from that Vercel scope, or the key is a
`preview:` key on the Production scope (or vice versa). Convex deploy
keys are scope-bound. Set the correct key on the correct scope.

**Symptom: Vercel Production deploy fails immediately with a missing
`CONVEX_DEPLOY_KEY`.**
That is the intended fail-fast state until a `prod:` deploy key is
generated. This session ships Preview only. See the item in
WAITING_ON_HUMAN.md.

**Symptom: `/dashboard` shows the setup-required state even after Convex is seeded.**
Confirm `NEXT_PUBLIC_CONVEX_URL` is set in the Vercel scope that is
serving the build, not just locally. The variable is public but still
build-time — Vercel bakes it into the browser bundle at build. Redeploy
after adding it.

**Symptom: `POST /api/upload` returns a 401 with a valid Telegram request.**
`TELEGRAM_WEBHOOK_SECRET` is mismatched between the Next.js runtime and
the Convex runtime. Because it is a mirrored variable, the two sides
must hold the same string. Reseed both with the same value.

**Symptom: `/admin` returns 403 for a real staff address.**
Either `CAMPUSCORE_ADMIN_ALLOWLIST` is empty (fail-closed default) or the
address is not on it. The middleware requires both (a) a verified
staff-domain email for the active school AND (b) a case-insensitive match
on the allowlist. Fix by adding the address to
`CAMPUSCORE_ADMIN_ALLOWLIST` in **both** runtimes.

**Symptom: `npm ci` extracts a half-broken `node_modules` on the UNC path.**
This is the Session 2 UNC-path issue. Run from the Local_Mirror instead;
see the caveat under Local Development Setup. Do not commit any
half-extracted files.

**Symptom: `next build` errors with "You cannot have two parallel pages that resolve to the same path" at `/`.**
Both `app/page.tsx` and `app/(promo)/page.tsx` exist. Delete
`app/page.tsx` — the promo route group serves `/` for this deployment.

**Symptom: The escalation email path fires a `console.log` but sends no email.**
That is the intended stub behavior when any one of `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, or `RESEND_ESCALATION_TO` is unset. To go live, seed
all three in the Convex environment. Escalation email volume is on the
Resend free tier (3,000/month); flag it in WAITING_ON_HUMAN.md if a
feature would materially raise that number.

## Approval-checkpoint reminder

Before merging any fork PR that changes deployment configuration, re-read
`AGENTS.md` and confirm the PR does not silently:

- change the 60-second emergency SLA threshold,
- change the reaper TTL or `retry_count` dead-letter threshold,
- change the hazard lexicon word list,
- change the NSFW/violence confidence cutoff,
- add a new third-party dependency, or
- introduce a human image-review queue, a `pending_review` state, or a
  real recipient for `/api/legal-escalation`.

Every one of the above is an approval-checkpoint item. Fork developers
must not close any of them without an explicit, separate,
human-approved task. Residual items and follow-ups (including the
Production `prod:` deploy key, the pending `// verify` school domains,
and the Cloudflare orange-cloud toggle) live in
`WAITING_ON_HUMAN.md` — check it before treating a deployment as
production-ready.
