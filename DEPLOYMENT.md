# Deployment Notes

This file lists the environment variables and human-only steps needed for local validation and Vercel deployment. It intentionally contains no secret values.

## Local Setup

Use a local working path if npm is slow or incomplete on the network share. The current validated mirror path is:

```powershell
C:\Users\bryan\AppData\Local\Temp\opencode\sgCampusCore2026-local
```

Install and validate after Convex is configured:

```powershell
npm ci
npx convex dev --once
npm run typecheck
npm run lint
npm run build
```

## Next/Vercel Env

Add these to Vercel for Production, Preview, and Development unless intentionally different:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CONVEX_URL
CAMPUSCORE_SCHOOL_CODE
CAMPUSCORE_ADMIN_ALLOWLIST
CSAM_SCAN_ENABLED
TELEGRAM_WEBHOOK_SECRET
```

Notes:

- `NEXT_PUBLIC_CONVEX_URL` comes from the Convex deployment after setup.
- `TELEGRAM_WEBHOOK_SECRET` must match the Convex env value used by the Telegram webhook and upload route.
- Keep `CSAM_SCAN_ENABLED=false` until the Cloudflare upload zone is genuinely orange-clouded and CSAM scanning is enabled.

## Convex Env

Set these in Convex, not Vercel, unless a Next.js route explicitly uses them:

```text
CLERK_JWT_ISSUER_DOMAIN
TELEGRAM_WEBHOOK_SECRET
GROQ_API_KEY
LLM_BASE_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_ESCALATION_TO
TELEGRAM_BOT_TOKEN
TELEGRAM_CHANNEL_ID
NSFW_MODEL_URL
CAMPUSCORE_SCHOOL_CODE
CAMPUSCORE_ADMIN_ALLOWLIST
```

Notes:

- `RESEND_API_KEY` alone is not enough. The code intentionally logs/stubs until both `RESEND_FROM_EMAIL` and `RESEND_ESCALATION_TO` are explicitly set.
- `CLERK_JWT_ISSUER_DOMAIN` should be the Clerk issuer/frontend domain URL used by Convex auth.
- Do not set a live legal escalation recipient. The legal escalation route is a console-only stub for the hackathon demo.

## Human-Only Steps

1. Convex: run `npx convex dev` interactively or provide a real `CONVEX_DEPLOY_KEY`; then generate and commit `convex/_generated/`.
2. Clerk: run `clerk auth login`, then `clerk init --app app_3FWku69u6a4VkFzoLkChiWgGwPC` if the project still needs CLI linking. Confirm the Clerk dashboard restricts signups to the intended school domains.
3. Vercel: create a Vercel access token and expose it as `VERCEL_TOKEN` locally if CLI deployment is needed. Do not pass it via `--token`.
4. Telegram: create the bot token, channel, and webhook registration.
5. Cloudflare: orange-cloud the upload route and enable CSAM scanning before setting `CSAM_SCAN_ENABLED=true`.

Because real keys were shared during setup, rotate them before any public repo sharing or post-hackathon production use.
