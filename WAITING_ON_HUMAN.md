# Waiting on Human

> Single source of truth for everything that needs a human/dashboard/account
> action. The build never blocks on these — each is stubbed in code and the
> real requirement is listed here. Add to this file when new items are found.

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

## Registry Domain Verification (multi-school-template-hardening, R1.6)

> Autonomous agents cannot perform this verification — requires school IT
> portal access or a current student account per design.md § LLD-1 Step 1.
>
> Each row below tracks one `SchoolEntry` in `config/schoolRegistry.ts`
> whose `studentDomains` value is currently annotated `// verify`. A row is
> closed only when: (a) the listed student domain is independently confirmed
> against the school's published IT documentation (school IT portal or a
> current student account at that school); AND (b) the closing pull request
> removes the `// verify` comment on that entry in
> `config/schoolRegistry.ts`; AND (c) the same PR adds a populated
> `verified` block on that entry with `{ at, by, source }` per the
> `SchoolEntry.verified` shape defined in design.md § Component 1 (added by
> Task 1.2 of this spec).

- [ ] **Singapore Institute of Technology (`sit`)** — current unverified
      student domain: `singaporetech.edu.sg`. Close per the section
      preamble above (independent confirmation + `// verify` removal + populated
      `verified` block in the same PR).
- [ ] **Singapore University of Social Sciences (`suss`)** — current
      unverified student domain: `suss.edu.sg`. Close per the section
      preamble above.
- [ ] **Ngee Ann Polytechnic (`np`)** — current unverified student domain:
      `student.np.edu.sg`. Close per the section preamble above.
- [ ] **Singapore Polytechnic (`sp`)** — current unverified student domain:
      `ichat.sp.edu.sg`. Close per the section preamble above.
- [ ] **Temasek Polytechnic (`tp`)** — current unverified student domain:
      `student.tp.edu.sg`. Close per the section preamble above.
- [ ] **Nanyang Polytechnic (`nyp`)** — current unverified student domain:
      `stu.nyp.edu.sg`. Close per the section preamble above.
- [ ] **Republic Polytechnic (`rp`)** — current unverified student domain:
      `myrp.edu.sg`. Close per the section preamble above.
- [ ] **Institute of Technical Education (`ite`)** — current unverified
      student domain: `ite.edu.sg`. Close per the section preamble above.

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

## Deferred Items from Multi-School Template Hardening (Session 4)

- [ ] **128-bit token migration** — Task 1.4 was comment-only. Preferred
      form is `hexEncode(crypto.getRandomValues(new Uint8Array(16)))` for a
      clean 128 bits vs. the current `crypto.randomUUID().replace(/-/g, "")`
      at 122 bits. Migration needs its own PBT run to prove no regression.
      Deferred to a future spec.
- [ ] **Dual-secret Telegram webhook variant (R9.3)** — comma-separated
      `TELEGRAM_WEBHOOK_SECRETS` env with any-of match — eliminates the
      propagation window during rotation. Design-documented in
      DEPLOYMENT.md § Telegram Webhook Secret Rotation → Dual-secret
      variant (deferred). Requires its own spec, code change to the webhook
      handler, and security review.
- [ ] **MOE school code granularity (R7.5)** — whether a specific JC or
      secondary school sharing `students.edu.sg` warrants a per-school
      entry distinguished by a school-owned identifier — open question
      deferred. Framing in design.md § Open Questions item 5; ratified in
      DEPLOYMENT.md § Registry Evolution Process → Open question deferred.
- [ ] **P2/P3/P7 re-verification against real Convex harness** — the
      current property tests run against `convex/pairing.testStub.mjs`
      (in-memory serializable stub). A follow-up run against Convex's real
      mutation harness (if/when it becomes available in a Node --test
      compatible form) would strengthen the guarantees, particularly around
      the serializability claim in the P2 single-use property. Not blocking
      — the stub matches Convex's documented serializability semantics —
      but worth a spec-scoped re-verify next time the Convex test SDK ships
      something that fits `.mjs` runners without adding a devDep.
