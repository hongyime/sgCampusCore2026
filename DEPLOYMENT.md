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

1. **GitHub** — fork of `github.com/hongyime/sgCampusCore2026`. The
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
   `sp`, `tp`, `nyp`, `rp`, `ite`. The Registry is deliberately restricted
   to institutions whose canonical student subdomain uniquely identifies
   the school; MOE-tier schools (primary / secondary / JC) sharing the
   Student iCON `students.edu.sg` domain are out of scope for this
   template (see the design.md § Open Questions item 5 framing). If your
   school is not listed AND has its own unique student subdomain, add a
   `SchoolEntry` in the same PR and populate `studentDomains` and
   `staffDomains` from the school's own IT documentation.
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

**Symptom: Vercel build reaches `next build` OK but fails at
`convex deploy` with `Environment variable X is used in auth config file
but its value was not set`.**
The Convex Preview deployment (a per-branch deployment named by the
Convex platform, e.g. `elated-dogfish-303`) has no env vars set. Seed
them one of two ways:
1. **Project-level defaults for all preview deployments** (durable — new
   preview branches inherit these on first push):

   ```powershell
   $env:CONVEX_OVERRIDE_ACCESS_TOKEN = "<CONVEX_PAT>"
   npx convex env default set --project <team>:<project> --type preview <NAME> <VALUE>
   ```

   Preview deploy keys do NOT have permission to write project-level
   defaults; a Convex Personal Access Token (PAT) is required. See
   Convex docs on Deploy Keys and Personal Access Tokens.
2. **Direct seeding of an existing preview deployment** (immediate — an
   existing preview deployment does NOT retroactively inherit later
   project-default writes):

   ```powershell
   $env:CONVEX_OVERRIDE_ACCESS_TOKEN = "<CONVEX_PAT>"
   npx convex env set --deployment <preview-name> <NAME> <VALUE>
   ```

Do both: `default set --type preview` for durability, `env set
--deployment <preview-name>` for the deployment that already exists.

### Env file taxonomy — .env, .env.example, .env.local, .env.convex.local

Two runtimes, so two files of real values plus one committed template:

| File                    | Committed? | Owning runtime               | Purpose                                                                                     |
| ----------------------- | ---------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `.env.example`          | Yes        | Both (docs only)             | Committed template. Placeholders only, never real values. Read by no runtime — docs surface.|
| `.env.local`            | No         | Next.js (local `next dev`)   | Real values that the Next.js runtime reads locally. `.env*.local` is gitignored.            |
| `.env.convex.local`     | No         | Convex CLI (local seed)      | Real values fed to `npx convex env set` and `--from-file`. `.env*.local` is gitignored.     |
| `.env`, `.env.development`, `.env.production` | Not committed | (none) | Do not use. They are gitignored to prevent unscoped secret leaks. Consolidate onto the two `.local` files above. |

Rules:

- Never commit any file except `.env.example`.
- The Next.js runtime on Vercel does NOT read either `.env*.local` file
  in the cloud build — it reads Vercel Project Environment Variables.
- The Convex runtime on `convex.cloud` does NOT read either file — it
  reads what `npx convex env set` seeded. `.env.convex.local` exists
  purely to give the operator a single-file seed source.
- `.gitignore` already covers `.env`, `.env*.local`, `.env.development`,
  `.env.production`. Verify with `git check-ignore -v .env.local`.

### CONVEX_WEBHOOK_URL — the Telegram webhook target for Convex

Convex serves HTTP actions from a different hostname than the WebSocket
data plane. The mapping is deterministic: replace the `.convex.cloud`
suffix on the deployment URL with `.convex.site` and append the route.

For this preview deployment:

- `NEXT_PUBLIC_CONVEX_URL` = `https://elated-dogfish-303.convex.cloud`
  (data plane; WebSocket + queries/mutations)
- Convex HTTP actions base = `https://elated-dogfish-303.convex.site`
- Telegram webhook URL = `https://elated-dogfish-303.convex.site/telegram/webhook`
  (the route registered by `convex/http.ts`)

Register that URL against the Telegram bot via `setWebhook`, passing
`secret_token` = the value of `TELEGRAM_WEBHOOK_SECRET` (mirrored in
both runtimes). Do not do this from inside a build; it is a one-shot
operational step. Flagged in WAITING_ON_HUMAN.md.

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

## Fork-and-Adopt Runbook (per-school operator handoff)

> This section is the operational handoff a school administrator hands to
> their in-house engineer. It mirrors the design in
> `.kiro/specs/multi-school-template-hardening/design.md § LLD-7` and
> covers exactly what has to happen once, by whom, before this fork can
> reach a green Vercel Preview under a school's own name. It is
> deliberately duplicative with the "Fork-and-deploy runbook for other
> schools" section above — that section is the shortest linear path;
> this section is the same material re-cut for the school
> administrator ↔ engineer split, with the authorization surface, the
> ongoing maintenance surface, and the environment-variable contract
> called out separately.

### What the school administrator authorizes before engineering starts

The engineer cannot start until the school administrator has confirmed
each of the following. None of these decisions belong to the engineer.

- **Third-party service account authority.** The engineer needs
  authorization to create school-owned or team-owned accounts on all six
  services in the approved stack: **Clerk** (auth), **Convex** (backend),
  **Vercel** (hosting), **Telegram** (bot via @BotFather), **Resend**
  (emergency escalation email), and **Groq** (LLM triage). Free tier is
  sufficient for the pilot per `AGENTS.md`. No new vendors may be added
  without a separate AGENTS.md-scoped approval.
- **Canonical email domains confirmed against the Registry.** Before any
  code is deployed, the administrator confirms the school's canonical
  student and staff email domains against the `SchoolEntry` for their
  `code` in `config/schoolRegistry.ts`. If the entry still carries a
  `// verify` comment on `studentDomains`, that comment must be cleared
  (and a `verified` block populated) in an upstream PR before the fork
  is treated as production-ready. Independent confirmation requires
  access to the school's IT portal or a current student account and
  cannot be delegated to an autonomous agent.
- **Initial admin roster.** The administrator names **2 to 5 initial
  admin staff emails**, each on the school's staff domain, to seed
  `CAMPUSCORE_ADMIN_ALLOWLIST`. Fewer than 2 is discouraged (single
  point of failure); more than 5 dilutes the audit trail on admin
  changes. Every listed address is a peer admin; there is no
  superadmin distinction (see the Admin Auth Lifecycle section below).
- **Deployment domain choice.** Either (a) a subdomain of a
  school-owned domain (for example `campuscore.<school>.edu.sg` on a
  school-controlled DNS zone) or (b) the Vercel-provided
  `<project>.vercel.app` default. Choose before creating the Vercel
  project; changing later requires reissuing Clerk redirect URLs and
  the Telegram webhook URL.

### Seven one-time engineering setup steps

Once the four authorizations above are in place, the engineer performs
the following seven steps once per school. This is the same sequence
codified in design.md § LLD-7, re-stated here for the runbook reader.

1. **(a) Fork the repo.** Fork `github.com/hongyime/sgCampusCore2026`
   into the school's GitHub organization. All subsequent steps operate
   against the fork.
2. **(b) Verify or add the school's `SchoolEntry`.** Check
   `config/schoolRegistry.ts` for an entry whose `code` matches the
   school. If present and free of `// verify` comments, proceed. If the
   school is not listed, or the entry still carries `// verify`, submit
   an upstream PR that adds or completes the entry per the Registry
   Evolution Process (see the Registry Evolution Process section below)
   before deploying under this school's name.
3. **(c) Create the Clerk instance.** Create a new Clerk application
   with **Google OAuth** enabled. In the Clerk dashboard set
   **allowed sign-up domains equal to `studentDomains ∪ staffDomains`**
   from the `SchoolEntry`; this is Layer 1 of the two-layer domain
   restriction and is authoritative. Create a **JWT template named
   exactly `convex`** (Convex reads it by that name via
   `convex/auth.config.ts`). Record the publishable key, the secret
   key, and the JWT issuer domain — these become
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
   `CLERK_JWT_ISSUER_DOMAIN` in step (d) and (f).
4. **(d) Create the Convex project and seed every Convex-side env var.**
   Create a Convex project, generate a **Preview** deploy key
   (`preview:` prefix), and run the ordered `npx convex env set`
   sequence documented in "Convex deployment env seeding" above.
   Every Convex-side variable in the Environment variable reference
   table below must be set here.
5. **(e) Create the Telegram bot and register the webhook.** Talk to
   `@BotFather` to create the bot and record its token; generate a
   webhook secret via `openssl rand -hex 32`; call the Telegram Bot
   API `setWebhook` against
   `https://<your-convex-deployment>.convex.site/telegram/webhook`
   with `secret_token` set to that value. Set `TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_WEBHOOK_SECRET` on the Convex side; mirror
   `TELEGRAM_WEBHOOK_SECRET` (and only that value) into the Vercel
   side (see the env var reference table below).
6. **(f) Create the Vercel project and set every Vercel-side env var.**
   Link the Vercel project to the fork, set the Build Command to
   `npx convex deploy --cmd 'next build'` per the Vercel setup section
   above, and populate every Vercel-side variable from the Environment
   variable reference table below on the **Preview** and
   **Development** scopes. Leave `CONVEX_DEPLOY_KEY` unset on the
   Production scope until a `prod:` deploy key is generated
   (`WAITING_ON_HUMAN.md`). Placeholder values in configuration
   examples in this repo are obviously fake (for example
   `sk_test_REPLACE_ME`, `smu-preview.example.com`); real values live
   only in Vercel Project Settings and the Convex dashboard.
7. **(g) Run the four end-to-end verifications.** After the first
   Preview build exits Ready, walk each of these four flows on the
   Preview URL:
    - **Student sign-in.** Sign in as an account on the school's
      student domain; the dashboard loads.
    - **Pairing round-trip.** Create a pairing token, open the
      Telegram deep link, send a test report; the report appears on
      the public dashboard within the SLA.
    - **Admin sign-in.** Sign in as a staff-domain address that is on
      `CAMPUSCORE_ADMIN_ALLOWLIST`; `/admin` is reachable.
    - **Non-admin 403.** Sign in as a student-domain address (or a
      staff-domain address not on the allowlist); `/admin` returns
      HTTP 403.

### Ongoing per-school maintenance

Once the fork is live, the school's engineer owns the following
recurring activities. None require code changes; each is an operational
step against the deployment platforms.

- **Annual `TELEGRAM_WEBHOOK_SECRET` rotation.** Rotate on a defined
  schedule — annually is sufficient for the threat model. Follow the
  five-step single-secret procedure documented in the
  [Telegram Webhook Secret Rotation](#telegram-webhook-secret-rotation)
  section below (§5.4 in the spec's task order).
- **Telegram bot token rotation on bot-admin departure.** When a
  person with `@BotFather` control over the school's bot leaves the
  team, revoke and reissue the bot token via `@BotFather` (`/revoke`),
  update `TELEGRAM_BOT_TOKEN` on the Convex side, and redeploy Convex.
  This is separate from the webhook secret rotation and does not
  require reissuing the webhook URL.
- **Admin changes via `CAMPUSCORE_ADMIN_ALLOWLIST` edit plus
  redeploy.** To onboard, rotate, or revoke an admin, edit the
  `CAMPUSCORE_ADMIN_ALLOWLIST` env value in **both** the Vercel and
  the Convex environments and redeploy. This is the entire admin
  lifecycle — there is no admin table, no runtime mutation, no
  self-service escalation surface. See the
  [Admin Auth Lifecycle](#admin-auth-lifecycle-onboard--rotate--revoke)
  section below (§5.2 in the spec's task order) for the full
  onboard/rotate/revoke procedure and the design rationale.
- **Periodic upstream pull for security fixes and Registry updates.**
  Pull from `github.com/hongyime/sgCampusCore2026` on a defined
  cadence (monthly is typical) to receive security fixes, dependency
  bumps, and new or corrected `SchoolEntry` entries. New Registry
  entries are additive; a downstream deployment only *uses* an entry
  whose `code` matches its own `CAMPUSCORE_SCHOOL_CODE`.

### Two-layer domain restriction reminder

The template ships with a deliberate **two-layer** defense on the
question "which email addresses are allowed to sign in and act as this
school's members and admins." Both layers must be configured; either
alone is insufficient.

- **Layer 1 — Clerk dashboard allowed sign-up domains (authoritative).**
  The Clerk instance for this deployment is configured, in the Clerk
  dashboard, with allowed sign-up domains equal to
  `studentDomains ∪ staffDomains` for this school's `SchoolEntry`.
  Accounts outside those domains cannot obtain a session JWT in the
  first place. This is the primary gate.
- **Layer 2 — `middleware.ts` re-check (defense-in-depth).** Every
  request to `/admin(.*)`, `/api/admin(.*)`, `/volunteer(.*)`, and
  `/api/resolve(.*)` re-checks the verified JWT's email claim against
  the same `SchoolEntry` via `isAdminEmail` and `isSchoolMemberEmail`
  in `middleware.ts`, and returns HTTP 403 on mismatch. This is the
  backup gate.

The two layers exist because Layer 1 can drift under operator error
or an undocumented dashboard change, and Clerk's client libraries have
historically shipped bypass CVEs; Layer 2 is the last-ditch enforcement
after a Layer 1 failure. **Configuring only one is a
misconfiguration.** If a fork operator ever finds a scenario in which
Layer 2 is inconvenient and considers relaxing it, that scenario is
in-scope for a security review, not a code change (see
`.kiro/specs/multi-school-template-hardening/design.md § Auth Model`,
§ Security Considerations, § Error Scenario 6).

### Environment variable reference table

Every variable the per-school template requires, sorted by runtime.
This table is the authoritative subset of variables the fork operator
must set to reach a green Preview; the full repository reference table
(with optional and legacy variables) lives above under
"Environment variable reference." Do **not** paste real secret values
here or anywhere in git — placeholders in any example are obviously
fake (for example `sk_test_REPLACE_ME`,
`https://<your-convex-deployment>.convex.site/telegram/webhook`,
`smu-preview.example.com`). Real values live only in the Vercel
Project Settings and the Convex dashboard.

| Variable                             | Runtime                     | Required             | Sensitive       |
| ------------------------------------ | --------------------------- | -------------------- | --------------- |
| `CAMPUSCORE_SCHOOL_CODE`             | Next.js + Convex (mirrored) | Yes                  | No              |
| `CAMPUSCORE_ADMIN_ALLOWLIST`         | Next.js + Convex (mirrored) | Yes (may be empty)   | Yes (staff PII) |
| `NEXT_PUBLIC_CONVEX_URL`             | Next.js                     | Yes                  | No              |
| `CONVEX_DEPLOY_KEY`                  | Vercel build only           | Yes                  | Yes             |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`  | Next.js                     | Yes                  | No              |
| `CLERK_SECRET_KEY`                   | Next.js server              | Yes                  | Yes             |
| `CLERK_JWT_ISSUER_DOMAIN`            | Convex                      | Yes                  | No              |
| `TELEGRAM_BOT_TOKEN`                 | Convex                      | Yes                  | Yes             |
| `TELEGRAM_WEBHOOK_SECRET`            | Convex                      | Yes                  | Yes             |

Runtime column notes:

- **Next.js + Convex (mirrored)** — the same value is set in **both**
  runtimes because both sides read it. A mismatch is a
  misconfiguration; see the Troubleshooting section above.
- **Next.js** — read only by the Next.js runtime (server or, if
  prefixed `NEXT_PUBLIC_`, also the browser). Not set on Convex.
- **Convex** — set via `npx convex env set` and read only by Convex
  functions. Not set on Vercel.
- **Vercel build only** — read exclusively by the Vercel Build Command
  (`npx convex deploy --cmd 'next build'`) during build time. Never
  read at runtime and never exposed to the browser.

Sensitive column notes:

- **Yes** means the value is a bearer credential or PII and must never
  appear in a browser bundle, a log line, a screenshot, or a
  committed file. `CAMPUSCORE_ADMIN_ALLOWLIST` is marked sensitive
  because it contains staff email addresses; treat it as PII even
  though it is not a bearer secret.
- **No** means the value is safe to include in the browser bundle
  (for `NEXT_PUBLIC_*` variables) or safe to log at info level (for
  identifier-only values such as `CAMPUSCORE_SCHOOL_CODE` and
  `CLERK_JWT_ISSUER_DOMAIN`).

## Admin Auth Lifecycle (onboard / rotate / revoke)

> This section is the operational procedure for adding, rotating, and
> revoking per-school admins. It mirrors the design in
> `.kiro/specs/multi-school-template-hardening/design.md § LLD-9` and
> ratifies the Session-1 decision that admin is a flat, env-driven set
> with no schema-backed identity. Configure `CAMPUSCORE_ADMIN_ALLOWLIST`
> on both runtimes (see the [Environment variable reference table](#environment-variable-reference-table)
> in the Fork-and-Adopt Runbook above) and follow the procedures below.

### Onboarding an admin

Grant admin access to a new staff member by adding their staff-domain
email to the allowlist in **both** runtimes. There is no schema
migration and no runtime mutation involved.

1. Append the target email (for example `staff-alice@<school>.edu.sg`)
   to `CAMPUSCORE_ADMIN_ALLOWLIST` in the **Vercel** environment on
   every scope that serves traffic (typically Preview and Production).
2. Append the same email to `CAMPUSCORE_ADMIN_ALLOWLIST` in the
   **Convex** environment via
   `npx convex env set CAMPUSCORE_ADMIN_ALLOWLIST "<existing entries>,staff-alice@<school>.edu.sg"`
   (Convex env set takes a full replacement string; preserve the
   existing entries in the same call).
3. Redeploy the Vercel project so the Next.js runtime picks up the new
   value; Convex hot-reloads on env set for the Convex runtime, so no
   separate Convex redeploy is required.

The newly onboarded email may sign in against Clerk immediately (Layer 1
already permits any staff-domain email); the middleware and Convex-side
predicates recognize the address as an admin only after the Vercel
redeploy has picked up the updated env value.

### Rotating or revoking an admin

Rotation and revocation are the same operation. Both are performed
entirely through the env surface — there is no session invalidation to
trigger, no schema patch to apply, and no runtime mutation to call.

1. Remove the target email (for example `staff-bob@<school>.edu.sg`)
   from `CAMPUSCORE_ADMIN_ALLOWLIST` in the **Vercel** environment on
   every scope that carries the value.
2. Remove the same email from `CAMPUSCORE_ADMIN_ALLOWLIST` in the
   **Convex** environment via `npx convex env set` with the trimmed
   list.
3. Redeploy Vercel and confirm the Convex env change has propagated.

The revoked email's next request to any `/admin/*` (or `/api/admin/*`)
route returns **HTTP 403 on the following request cycle** — Layer 2 of
the two-layer defense re-checks `isAdminEmail` against the freshly
loaded allowlist per request. The revoked user's Clerk session remains
valid for non-admin routes; only admin surfaces fail closed. If a
former-staff address must be locked out of the dashboard entirely, that
is a Clerk-side action (revoke the user in the Clerk dashboard), not an
allowlist edit.

### No admin table exists

This spec preserves the Session-1 admin model in full. There is no
`admins` table anywhere in `convex/schema.ts`, no `_admin_grants` table,
and no superadmin distinction. Every entry in `CAMPUSCORE_ADMIN_ALLOWLIST`
is a peer; the allowlist is a flat, unordered set with no roles inside
it. A future contributor proposing either an in-database admin model or
a superadmin tier must produce a separate, approved spec (see the
"Follow-up (deferred, not part of this spec)" note in
`.kiro/specs/multi-school-template-hardening/design.md § LLD-9`).

### Why env vars, not a database

The env-var admin model is a deliberate choice, not an accident of
implementation order. It preserves three properties that a
database-backed admin model would give up, and any proposal to migrate
admins into a Convex table must argue against all three in writing:

- **Auditability via env-history.** Every change to
  `CAMPUSCORE_ADMIN_ALLOWLIST` leaves a trace in the Vercel and Convex
  environment-variable history with a human name attached to it. A
  Convex mutation that edits an `admins` table would need additional
  audit-log plumbing to reach parity, and that plumbing is only as
  trustworthy as the code around it.
- **No self-service escalation surface.** There is no mutation an
  attacker could target to grant themselves admin. The escalation path
  requires access to the Vercel and Convex dashboards, which is a much
  smaller and more monitorable attack surface than a Convex mutation
  whose auth guard could regress under any code change.
- **Fail-closed simplicity.** An empty or absent
  `CAMPUSCORE_ADMIN_ALLOWLIST` yields the empty set of admins
  (Correctness Property P1, `.kiro/specs/multi-school-template-hardening/design.md § Correctness Properties`).
  There is no schema migration path, no "orphaned admin row" scenario,
  and no window during which an old-shape row remains active after a
  fix.

The cost of the current model is a Vercel redeploy (~1 minute) plus a
Convex env set (~seconds) per admin change. This is acceptable for the
pilot's admin-change frequency. If that frequency ever justifies
revisiting the model, the follow-up work is a separate spec — not an
in-place edit to this deployment doc.

### Env var mirroring rule

`CAMPUSCORE_ADMIN_ALLOWLIST` MUST be set **identically** in the Next.js
runtime environment (Vercel Project Settings) and the Convex runtime
environment (`npx convex env set`). These are two separate
operating-system processes with two separate `process.env` maps; there
is no shared configuration surface between them and no automatic
mirroring. A value present only on one side yields inconsistent admin
decisions between the middleware (Next.js) and the Convex-side
predicates, which is a misconfiguration by definition — see the
`Symptom: /admin returns 403 for a real staff address` entry under
Troubleshooting above and the `Next.js + Convex (mirrored)` row for
`CAMPUSCORE_ADMIN_ALLOWLIST` in the
[Environment variable reference table](#environment-variable-reference-table)
of the Fork-and-Adopt Runbook.

## Registry Evolution Process (adding / updating / no runtime override)

> This section is the operational procedure for changing
> `config/schoolRegistry.ts` — the trust anchor used by both layers of
> the two-layer domain restriction. It mirrors the design in
> `.kiro/specs/multi-school-template-hardening/design.md § LLD-8` and
> ratifies the Session-1 decision that the Registry is compile-time
> data with no runtime override surface. All changes flow through an
> upstream PR; downstream forks receive them via periodic pull.

### Adding a new school

Onboarding a new institution is an **upstream PR against the shared
codebase**, not a per-fork operation. The PR MUST arrive with the entry
already verified — an unverified entry is a `// verify` placeholder,
not a shippable Registry row.

1. Add a `SchoolEntry` to `SCHOOL_REGISTRY` in
   `config/schoolRegistry.ts` with the school's `code`, `name`,
   `studentDomains`, and `staffDomains` populated from that school's
   own IT documentation.
2. Populate the `verified` block with the source URLs consulted
   (typically the school's IT portal or student handbook) and the
   reviewer's handle, so a future maintainer can retrace the audit
   without re-doing it.
3. Run `npm run test:unit` and `npm run test:pbt` locally. Both suites
   cover the Registry static shape test (uniqueness of `code`, lowercase
   non-`@` domain shape, `verified`-block-or-`// verify`-comment
   presence, `REGISTRY_SCHEMA_VERSION` sanity) and the P6 uniqueness
   property test. Both MUST exit 0 before the PR is opened.
4. Open the PR against upstream. Reviewer independently confirms the
   domains against the same public IT documentation cited in the
   `verified.source` field before merging.

No fork-only Registry addition is required for a school that follows
this path — once the upstream PR lands, every downstream deployment
receives the entry on its next upstream pull.

### Updating an existing school's domain

Domain changes (a school's IT migrates the student subdomain, a new
staff subdomain is added, a legacy domain is retired) follow the same
upstream-PR flow as adding a new school. The Registry is intentionally
**additive**: a new domain is appended to the appropriate array, and
the previous domain is retained for a documented grace period so
already-verified accounts do not lose access mid-term.

1. Open an upstream PR that appends the new domain to the appropriate
   array — `studentDomains` for a student subdomain change,
   `staffDomains` for a staff subdomain change.
2. Retain the previous domain in the same array with a source comment
   marking the retirement date, for example
   `// deprecated: retire after 2027-01-01`. The date is the school's
   own retirement date, not an arbitrary internal deadline.
3. Refresh the entry's `verified.at` timestamp and `verified.by`
   reviewer handle to reflect the audit for this change.
4. Retire the deprecated domain in a subsequent PR only when the school
   has explicitly announced that the old subdomain no longer accepts
   mail. Removing a domain before that point strands existing paired
   accounts on the next 30-day re-verification cycle — see
   `.kiro/specs/multi-school-template-hardening/design.md § Error Scenario 4`
   for the recovery path and the reasoning behind the grace-period
   convention.

### Runtime override: none

There SHALL be no environment variable, no configuration file, and no
runtime mutation that patches Registry contents at deploy time. The
Registry is compile-time data by design — a runtime override surface
would create a bypass for the entire two-layer domain restriction, and
the audit trail for a domain change would move from git history (where
every reviewer can see it) into an env-var value on one deployment
(where nobody outside that operator can). This is a hard invariant of
this spec, not a convention.

A school with an urgent domain change that cannot wait for the upstream
PR review cycle patches `config/schoolRegistry.ts` in its **own fork**,
deploys the fork, and then opens the upstream PR to bring the change
back into shared code on the normal cadence. The fork-local patch is
git-tracked and reviewable inside that school's own repository, which
preserves the audit property; the runtime-override alternative would
not.

### Downstream propagation

Registry entries added or updated upstream reach a running deployment
only through the deployment's next **upstream pull-and-redeploy** —
there is no push channel from the shared repo to a per-school Vercel or
Convex runtime. Each downstream fork controls its own pull cadence
(annual, per-semester, or on-security-fix, per the operator's judgment
documented under "Ongoing per-school maintenance" in the Fork-and-Adopt
Runbook above).

An entry present in the Registry is only *used* by a given deployment
if that deployment's `CAMPUSCORE_SCHOOL_CODE` env value matches the
entry's `code`. Every other entry is inert data on that deployment —
`getActiveSchool()` reads a single entry per request, and both the
Admin_Predicate and the Member_Predicate delegate to it. This is the
mechanism by which one shared Registry safely serves N per-school
deployments without any cross-tenant coupling at runtime.

### MOE-tier schools: out of scope (resolved 2026-07-04)

Earlier drafts of this template carried a generic `moe-school` Registry
entry covering all MOE primary / secondary / JC students who share
`@students.edu.sg`. That entry has been **removed** by the Session 4
product decision: the Registry is restricted to institutions whose
canonical student subdomain uniquely identifies the school. Two schools
sharing `@students.edu.sg` cannot be told apart at the JWT layer, and
the pilot has no downstream identity gate that could disambiguate them
without a new privacy-sensitive design (see design.md § Open Questions
item 5 for the framing of the three candidate approaches that a future
spec would have to pick between).

**Effect on this template:** if you are running CampusCore for an MOE
primary school, secondary school, or junior college whose students use
`@students.edu.sg`, this fork does not yet support you as a distinct
tenant. Do not deploy against `moe-school` — the entry no longer exists.
Framing preserved in design.md § Open Questions item 5 in case a future
spec revisits the question.

## Telegram Webhook Secret Rotation

> This section is the operational procedure for rotating
> `TELEGRAM_WEBHOOK_SECRET` — the shared value Telegram echoes back in
> the `X-Telegram-Bot-Api-Secret-Token` header on every update, and the
> Convex webhook handler equality-checks against `process.env` to
> decide whether to admit or reject the request. It mirrors the design
> in `.kiro/specs/multi-school-template-hardening/design.md § LLD-6`
> and the ratification note in that same design's § Security
> Considerations. The current webhook handler accepts exactly one
> secret at a time; this spec does not change that. What follows is
> the safe-under-Telegram-retries procedure for turning the single
> secret over, plus the deferred dual-secret refinement that would
> eliminate the rotation-window rejection entirely.

### Automated rotation (GitHub Actions, monthly)

The primary rotation path is now the GitHub Actions workflow at
`.github/workflows/rotate-telegram-webhook-secret.yml`. It runs on the
first of every month at 03:15 UTC (11:15 SGT), and can also be triggered
manually from the Actions tab (`workflow_dispatch`) — including a
`dry_run: true` option that generates a new secret and logs actions
without touching Telegram or Convex, for pre-arm smoke testing.

Arming the workflow requires three repository secrets (Settings →
Secrets and variables → Actions) plus one repository variable:

| Setting | Type | Purpose |
|---------|------|---------|
| `TELEGRAM_BOT_TOKEN` | Secret | The bot's API token; same value as in the Convex env. |
| `CONVEX_DEPLOY_KEY` | Secret | A Convex production deploy key (`prod:` prefix) with permission to run `npx convex env set`. |
| `CONVEX_WEBHOOK_URL` | Secret | The full webhook URL (`https://<deployment>.convex.site/telegram/webhook`). |
| `TELEGRAM_ROTATION_ENABLED` | Variable | Set to `true` to arm. Unset or any other value = disarmed (workflow runs but no-ops with a clear message). |

Until `TELEGRAM_ROTATION_ENABLED=true` is set, the workflow is a
no-op — you can land the workflow file, land the secrets, then flip
the variable to `true` once you are ready. Missing any of the three
secrets also disarms the workflow, with a diagnostic line in the
workflow log identifying which one is missing.

The workflow performs the five-step manual procedure below (generate →
setWebhook → convex env set → propagation wait → verify) with the new
secret registered as a masked GitHub Actions output so it never appears
in logs.

### Manual rotation (fallback / emergency)

If the automated workflow is disarmed, misconfigured, or has been
disabled for some reason, the manual procedure below is the same
five-step operation executed by hand. Prefer the automated path in
normal operation. `S_old` is the current value of
`TELEGRAM_WEBHOOK_SECRET` on the Convex side; `S_new` is the fresh
value being installed. No real bot token appears in any command
below — the token in step 2 is elided because it lives only in the
Convex env and in a password manager, and this document is not the
source of truth for it.

1. Generate a fresh, cryptographically-random secret on the operator's
   workstation:

   ```bash
   openssl rand -hex 32
   ```

   The output is a 64-character lowercase hex string with 256 bits of
   entropy — well above the header field's threat model. Treat it as
   sensitive from the moment it is produced; do not paste it into
   chat, tickets, or terminal history that is not being retained
   deliberately. Call the resulting value `S_new`.

2. Call the Telegram Bot API `setWebhook` method with the **same
   webhook URL** and `secret_token` set to `S_new`. The URL MUST match
   the URL already registered for this bot; only the secret changes.
   Placeholder form (the bot token is elided — replace
   `<your-bot-token>` with the value from the Convex env,
   `<S_new>` with the string generated in step 1):

   ```bash
   curl -sS "https://api.telegram.org/bot<your-bot-token>/setWebhook" \
     --data "url=https://<your-convex-deployment>.convex.site/telegram/webhook" \
     --data "secret_token=<S_new>"
   ```

   From this call onwards, Telegram sends `S_new` in the
   `X-Telegram-Bot-Api-Secret-Token` header on every new update. Any
   in-flight retries of updates that were first sent before this call
   continue to carry `S_old` in the header — this is the reason the
   propagation window described below is not zero.

3. Set the new secret on the Convex runtime:

   ```bash
   npx convex env set TELEGRAM_WEBHOOK_SECRET <S_new>
   ```

   Convex records the new value in the deployment's environment and
   begins hot-reloading the webhook handler's `process.env`.

4. Redeploy Convex so the webhook handler is running against the new
   env value on every module instance:

   ```bash
   npx convex deploy
   ```

   Once Convex reports the deploy complete, `S_new` is authoritative
   on both sides — Telegram is sending it, and the handler is checking
   against it.

5. Verify by sending a benign test message to the bot from an operator
   account and confirming (a) the message is accepted, (b) the Convex
   logs show no `403 secret mismatch` entries for the test message,
   and (c) a subsequent inbound update flows through the normal
   ingestion path. Only after this end-to-end check succeeds is the
   rotation considered complete; until then, treat both `S_old` and
   `S_new` as sensitive and retain the password-manager entry for
   `S_old` for the length of one Telegram retry window (see the next
   sub-section) in case a rollback is needed.

### Propagation window

Between step 3 (Convex env set) and Convex finishing its hot-reload of
the webhook handler — typically ~1–2 seconds — there is a brief window
during which Telegram may already be sending `S_new` in the header
while the handler on some instance is still checking against `S_old`.
Updates that arrive inside that window with `S_new` in the header may
be rejected by the still-old handler with a `403 secret mismatch`
response.

This is safe under the current Telegram delivery contract: Telegram
retries failed webhook deliveries with exponential backoff, and the
retries arrive after the hot-reload has completed. No update is lost;
the observable effect is at most a few seconds of added delivery
latency on the small subset of updates that fell inside the window.
The Fork-and-Adopt Runbook above lists rotation on an annual cadence,
which means this delay is realized at most once per year per
deployment — well inside the noise floor of ordinary Telegram delivery
variance. Operators SHALL NOT retry the rotation in response to
transient `403 secret mismatch` entries in the Convex logs during the
window; those entries are the expected shape of the propagation
overlap and self-heal on Telegram's next retry.

### Dual-secret variant (deferred)

A future refinement, **not implemented in this spec**, would eliminate
the propagation window entirely by accepting more than one valid
secret at a time. The shape of that refinement is:

- A new environment variable `TELEGRAM_WEBHOOK_SECRETS`, comma-separated
  (for example `<S_old>,<S_new>`), replaces `TELEGRAM_WEBHOOK_SECRET`
  in the webhook handler.
- The handler parses the env into a set on each request and admits the
  update if the presented `X-Telegram-Bot-Api-Secret-Token` header
  equals **any** listed value. Rotation becomes: (a) append `S_new` to
  the set, (b) call `setWebhook` with `S_new`, (c) after the retry
  window has fully drained, remove `S_old` from the set.

This variant is documented here so a future operator or contributor
does not re-invent it or mistake its absence for an oversight. It is
deliberately deferred because the single-secret variant is safe under
Telegram's retry contract (see the propagation-window sub-section
above) and adding a second env var and a set-membership check to the
webhook handler would be a code change to a security-sensitive path
that this spec is explicitly out of scope for. A follow-up spec MUST
own that code change in full — this section merely reserves the
design space.

### Rejection on mismatch

The Convex webhook handler SHALL reject any inbound Telegram update
whose `X-Telegram-Bot-Api-Secret-Token` header does not equal the
current `TELEGRAM_WEBHOOK_SECRET` env value. A mismatched or absent
header yields an HTTP `403` response and no side effect on any Convex
table — the update is dropped at the edge before it reaches the
ingestion path.

This paragraph ratifies existing handler behavior; this spec adds no
new code to `convex/http.ts` or to any other module in the webhook
path. The purpose of the ratification is to make the security property
part of the written contract of this deployment — a future refactor
that removes the equality check, weakens it to a prefix match, or
routes unauthenticated inbound traffic to a mutation MUST be treated
as a regression against this section and reverted before merge. If a
legitimate need to change the check ever arises (for example the
dual-secret variant above), that change owns its own spec, its own
security review, and its own append to this document.

## Data Isolation Boundary (one deployment per school)

> This section ratifies the tenancy invariant that shapes every other
> section of this document: one Convex project, one Vercel project,
> one Clerk instance, and one Telegram bot serve exactly one school.
> It mirrors
> `.kiro/specs/multi-school-template-hardening/design.md § LLD-10`
> and the § Deployment Topology diagram in the same design. This spec
> does not change the boundary — it writes down, in operational
> language, the property that Session-1 already committed to, so a
> future contributor proposing a shared-runtime alternative has a
> cost/benefit to counter rather than an unstated convention.

### Tenancy unit

The tenancy unit is the deployment, not a row in a table. Every
CampusCore deployment SHALL provision exactly one of each of the
following, and each SHALL serve exactly one school selected by that
deployment's `CAMPUSCORE_SCHOOL_CODE` env value:

- One Convex project — owns `tickets`, `queue`, `pairings`, `users`,
  the scheduler, and the Telegram webhook endpoint.
- One Vercel project — hosts the Next.js dashboard, the middleware
  domain restriction, and every Next.js-side env var.
- One Clerk instance — Google OAuth application, JWT template named
  `convex`, allowed-sign-up domains equal to the active school's
  `studentDomains ∪ staffDomains`.
- One Telegram bot — its own bot token, its own webhook secret, its
  own channel roster.

The mapping is one-to-one across the whole set. Two schools SHALL NOT
share a Convex project, a Vercel project, a Clerk instance, or a
Telegram bot; a deployment SHALL NOT reference a second school by any
code path. `CAMPUSCORE_SCHOOL_CODE` picks exactly one row out of the
shared Registry, and every runtime lookup for the active school
(display name, domains, admin allowlist context) resolves through
`getActiveSchool()` against that single row.

### No `school_id` column

`convex/schema.ts` does not contain a `school_id` field on any table.
Cross-school data mixing is not prevented by a WHERE-clause convention
that a future contributor could forget — it is structurally impossible
because per-school databases are separate Convex projects that share
no address space, no connection string, no Clerk instance, and no
scheduler. There is no query surface from which a mutation on
Deployment A could read or write a row belonging to Deployment B, and
therefore no `school_id` filter to get wrong.

This is the property the deployment topology buys. It costs one Convex
project per school and one small amount of extra operator work at
adoption time; in return it removes an entire class of tenancy bugs
from the codebase.

### Reopening the door requires a new spec

Any proposal to reintroduce a `school_id` column and consolidate
schools onto a shared Convex project SHALL NOT be undertaken as a
refactor, a schema cleanup, or a "while we're in here" change. It MUST
own its own spec, and that spec MUST explicitly address four risks
before any implementation work begins:

- **Cross-tenant leak blast radius.** A single mutation that forgets
  the `WHERE school_id = ...` clause leaks across every school on the
  shared project. Under the current one-project-per-school model, that
  class of bug is structurally impossible. Any consolidation spec MUST
  document the enforcement mechanism (a helper like
  `assertSameSchool(ctx, row)` piped through every mutation and query,
  or an equivalent) and the test strategy that proves the enforcement
  holds under the same numeric-iteration budget as this spec's P1–P7
  property tests.
- **Quota accounting.** Each Convex project today has its own
  free-tier limits. On a shared project one busy school's bursts
  compete for scheduler slots and function-invocation budget with
  every other school. A consolidation spec MUST show how per-school
  quota fairness is preserved, or accept and document the fairness
  loss.
- **Delete-my-school-cleanly.** A school leaving the network today is
  `convex delete project` + `vercel remove project`. Under a shared
  project it becomes a schema-wide filter-and-delete migration across
  every table that carries `school_id`, plus a Clerk-side tenant
  cleanup, plus a bot deregistration. A consolidation spec MUST
  document the exit procedure end-to-end.
- **PDPA compliance separation.** Each school today retains sole
  custody of its reporters' PII — Clerk user IDs, verified `.edu.sg`
  emails, Telegram user IDs. Under a shared project that PII is
  co-mingled at rest and the compliance story becomes materially
  harder for any future PDPA (Singapore's Personal Data Protection
  Act) conversation. A consolidation spec MUST address the compliance
  posture explicitly, not implicitly.

Until a spec addressing all four risks is written, reviewed, and
approved, the door stays closed. This paragraph is the written
cost/benefit that any such proposal has to counter.

### Single-school request scope

No runtime code path SHALL enumerate entries for more than one school
in a single request. Every predicate that answers a question about
"which school does this identity belong to" reads from
`getActiveSchool()`, which returns exactly one `SchoolEntry` — the one
whose `code` equals `CAMPUSCORE_SCHOOL_CODE`. Concretely:

- The **Registry** is compile-time data. `getActiveSchool()` picks one
  row out of it per process; every other row is inert on this
  deployment.
- The **Admin_Predicate** (`isAdminEmail` in `config/school.ts`)
  checks the domain against `getActiveSchool().staffDomains` and the
  email against `CAMPUSCORE_ADMIN_ALLOWLIST` — neither surface
  references any other school.
- The **Member_Predicate** (`isSchoolMemberEmail` in
  `config/school.ts`) checks the domain against
  `getActiveSchool().studentDomains ∪ staffDomains` — again, one
  school only.

There is no request handler, middleware, mutation, action, or scheduled
job that iterates over the Registry, or over multiple entries, or that
takes a `school_code` parameter from the request. The active school is
resolved once, at module load, from the environment, and every
downstream check inherits it. A future change that introduces a
per-request school selector MUST be treated as a regression against
this section and reverted before merge — the deployment topology
enforces the isolation, and the code paths preserve it.

## Session 3 Task 23 addenda

Three points came up during the first green Vercel Preview deploy that
have permanent runbook implications. Adding them here rather than in
STATUS.md because STATUS.md is a per-session document and this material
is fork-durable.

### Why so many env files?

A fork developer starting the runbook for the first time will see
`.env.example`, `.env.local`, and `.env.convex.local` and reasonably
ask why. The short answer:

- **`.env.example`** — committed template. Every key is listed with an
  empty placeholder. This is the file a fork developer copies as the
  starting point. Real values never live here.
- **`.env.local`** — local-dev secrets for the **Next.js** runtime.
  `.gitignore` covers `.env*.local`; the file is never committed. Read
  by `next dev` and by the local `npm run build`, and by scripts that
  set the Telegram webhook. Cloud equivalent: **Vercel Project
  Settings → Environment Variables** (Preview / Production /
  Development scopes).
- **`.env.convex.local`** — local-dev secrets for the **Convex**
  runtime. Also gitignored. The Convex CLI reads `CONVEX_DEPLOY_KEY`
  from here to authenticate, and the file is the source-of-truth for
  the seeding scripts under `.omo/` that call `npx convex env set` for
  every Convex-side variable. Cloud equivalent: **Convex dashboard
  → Deployment settings → Environment Variables** (or `npx convex env
  set` and `npx convex env default set` from the CLI).

Neither cloud store reads the other. Vercel does not pass Convex-only
variables to the Convex runtime, and Convex does not pass its variables
to Next.js. That is the two-runtime split this runbook exists to make
legible; the three files above are the local-dev face of it.

### Telegram webhook wiring (a.k.a. "wtf is my CONVEX_WEBHOOK_URL")

There is no env var called `CONVEX_WEBHOOK_URL` in this project, and
there should not be — the value it would carry is derived, not
configured. Convex's HTTP router is served on `<slug>.convex.site`
(**not** `<slug>.convex.cloud`, which is the app-facing WebSocket URL).
The Telegram-facing path is defined in `convex/http.ts` as
`/telegram/webhook`.

The URL to hand to Telegram's `setWebhook` for the current Preview
deployment is:

```text
https://elated-dogfish-303.convex.site/telegram/webhook
```

`elated-dogfish-303` is the preview deployment slug of the
`hongyime/sgcampuscore` Convex project; substitute your own preview or
production slug for your fork. Register it with:

```bash
curl -s -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<slug>.convex.site/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

The `secret_token` must equal `TELEGRAM_WEBHOOK_SECRET` seeded into
Convex_Env (Convex `http.ts` compares it against the
`X-Telegram-Bot-Api-Secret-Token` header on every incoming update). It
is one of the three mirrored variables — set the same string on the
Nextjs_Env side too. Verify with `getWebhookInfo`:

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

The response should show your `.convex.site` URL and
`has_custom_certificate: false`, with an empty `last_error_message`.

### Deployment protection and the custom domain

Vercel projects created against `The Prawn Vercel` inherit an
organization-level SSO on every `*.vercel.app` URL — the
`ssoProtection.deploymentType` is `all_except_custom_domains`. That
means `sgcampuscore-<hash>-theprawnvercel.vercel.app` will 302 to a
Vercel SSO gate, but `sgcampuscore.hong-yi.me` (the custom domain)
will not. When you promote a deployment (Preview or Production) that
you want a stranger to browse, alias it explicitly to the custom
domain:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <VERCEL_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"alias":"sgcampuscore.hong-yi.me"}' \
  "https://api.vercel.com/v2/deployments/<DEPLOYMENT_ID>/aliases?teamId=<TEAM_ID>"
```

Once aliased, `curl -sI https://sgcampuscore.hong-yi.me/` returns
`HTTP/1.1 200 OK` and the `X-Vercel-Cache: PRERENDER` header. Without
the alias, requests to the `vercel.app` URLs are inaccessible to
anyone outside the Vercel org. Fork developers whose Vercel account is
not behind SSO can skip this step.
