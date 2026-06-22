# Waiting on Human

> Single source of truth for everything that needs a human/dashboard/account
> action. The build never blocks on these — each is stubbed in code and the
> real requirement is listed here. Add to this file when new items are found.

## Security (do soon)
- [ ] **Rotate the GitHub PAT embedded in the `origin` remote URL.** It is stored
      in plaintext in `.git/config` (`https://ghp_…@github.com/...`). Rotate at
      github.com/settings/tokens, then re-point the remote to SSH or a credential
      helper so no token lives in config. (Discovered session 1.)

## Credentials & Keys (stubbed via .env.example)
- [ ] **Telegram** — bot token (via @BotFather) + webhook URL registration
      (`setWebhook` to the deployed Convex HTTP endpoint). Code path stubbed.
- [ ] **Clerk** — instance publishable + secret keys, AND the per-school domain
      restriction (configured in the Clerk dashboard, not just in code). Each
      deployment restricts to ITS school's domains (see config/schoolRegistry.ts).
- [ ] **Per-school template config** — set `CAMPUSCORE_SCHOOL_CODE` and
      `CAMPUSCORE_ADMIN_ALLOWLIST` in BOTH the Next.js env and the Convex env.
      Confirm the school's exact STUDENT subdomain (several are marked `// verify`
      in config/schoolRegistry.ts) before a production deployment.
- [ ] **Convex** — deployment URL + deploy key (`npx convex dev` / project keys).
- [ ] **Resend** — API key (free tier, 3,000/mo) for emergency escalation email.
- [ ] **Groq / LLM** — API key for structured triage call (or local Ollama URL).
- [ ] **Vercel** — project linkage + all env vars mirrored into the Vercel
      project settings.

## Cloudflare Zone (dashboard-level, cannot be done from code)
- [ ] **Orange-cloud (DNS proxy)** the image-upload endpoint so bytes actually
      transit Cloudflare's edge — the CSAM tool only inspects proxied traffic.
- [ ] **Worker route** for edge ingestion.
- [ ] **Enable the CSAM scanning tool** (dashboard toggle).
- [ ] **Logpush** to the legal-escalation stub endpoint for WAF-block events.
      Until all of the above are live, `CSAM_SCAN_ENABLED` stays `false`.

## Accounts / Billing / Consent
- [ ] Any account creation, billing setup, or OAuth consent-screen approval
      across the above services.

## Approval Checkpoints (AGENTS.md — require human sign-off to change)
- [ ] 60-second emergency SLA threshold.
- [ ] Reaper TTL / `retry_count` dead-letter threshold.
- [ ] Hazard lexicon word list.
- [ ] NSFW/violence confidence cutoff (`0.50`).
- [ ] Any new third-party dependency beyond the approved stack.

## Pre-Demo Validation (tech_design §9 — needs live infra)
- [ ] Confirm `onnxruntime-web` + quantized model deploys within Vercel limits.
- [ ] Calibrate NSFW threshold against ~100 benign campus photos.
- [ ] Confirm upload zone is genuinely orange-clouded (not just configured).
- [ ] Send a real Resend test email to a CSOC-style inbox.
- [ ] Confirm legal-escalation endpoint is the stub, not a real intake address.
