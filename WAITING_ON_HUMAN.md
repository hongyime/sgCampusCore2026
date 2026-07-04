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

> **2026-07-04 update (Session 4 Wave 6):** Web-search-based verification
> closed 7 of the original 8 rows. Three of them (`sit`, `np`, `nyp`) had
> the WRONG student domain in the Registry and would have broken real
> student sign-ins in production — the corrections are now landed with
> populated `verified` blocks. Four (`suss`, `sp`, `tp`, `ite`) were
> already correct and now carry `verified` blocks citing the source URLs
> below. Only `rp` remains genuinely unconfirmable via public web sources
> and stays open.

- [x] **Singapore Institute of Technology (`sit`)** — CORRECTED from
      `singaporetech.edu.sg` (the staff-only domain) to
      `sit.singaporetech.edu.sg` (the student subdomain), per the SIT VPN
      login page which specifies `<student-id>@sit.singaporetech.edu.sg`.
      Source: <https://sitvpn.singaporetech.edu.sg/global-protect/login.esp>.
- [x] **Singapore University of Social Sciences (`suss`)** — confirmed
      `suss.edu.sg` (single institutional domain for both students and
      staff). Source: <https://sussprobono.com/> (student login example
      `johntan@suss.edu.sg`).
- [x] **Ngee Ann Polytechnic (`np`)** — CORRECTED from `student.np.edu.sg`
      to `connect.np.edu.sg`, per the NP Digital Certificates page which
      cites `s<student-id>@connect.np.edu.sg` as the student mail form.
      Source: <https://www.np.edu.sg/about-np/our-story/smart-campus/digital-certificates>.
- [x] **Singapore Polytechnic (`sp`)** — confirmed `ichat.sp.edu.sg`, per
      SP IT Services page (`studentname.24@ichat.sp.edu.sg`) and the
      SP Student Handbook Computing Resources policy.
      Source: <https://www.sp.edu.sg/student-services/it-services>.
- [x] **Temasek Polytechnic (`tp`)** — confirmed `student.tp.edu.sg`, per
      TP Students' Union contact address `tpsu@student.tp.edu.sg`.
      Source: <https://virtualcampus.tp.edu.sg/p10/students-union/>.
- [x] **Nanyang Polytechnic (`nyp`)** — CORRECTED from `stu.nyp.edu.sg`
      (never a valid NYP subdomain) to `mymail.nyp.edu.sg`, per the NYP
      Intranet/Internet Acceptance Usage Policy which specifies
      `@mymail.nyp.edu.sg` verbatim as the official student mail domain.
      Source: <https://mynypportal.nyp.edu.sg/en/resources/it-related-matters/nyp-intranet-internet-acceptance-usage-policy.html>.
- [ ] **Republic Polytechnic (`rp`)** — REMAINS OPEN. Web search on
      2026-07-04 could not confirm the RP student mail subdomain from any
      public source. `myrp.edu.sg` (the current guess) is plausible from
      the "MyRP" portal branding but is not attested by any RP IT
      documentation reachable via web search. Close by logging into the
      RP student portal (or asking a current RP student) and confirming
      the student mail domain; if it differs, correct
      `config/schoolRegistry.ts` and populate the `verified` block per
      the section preamble above.
- [x] **Institute of Technical Education (`ite`)** — confirmed `ite.edu.sg`
      (single institutional domain, no dedicated student subdomain). Every
      public ITE contact address across newsroom, admissions, alumni,
      career services, and student services resolves to `@ite.edu.sg`.
      Source: <https://www.ite.edu.sg/e-services-and-forms>.

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
- [x] **MOE school code granularity (R7.5)** — RESOLVED 2026-07-04 by
      product decision: MOE-tier schools (primary / secondary / JC) are
      NOT a target deployment. The generic `moe-school` Registry entry
      has been REMOVED. The Registry is now restricted to institutions
      whose canonical student subdomain uniquely identifies the school
      (a hard prerequisite for the pilot). A future spec MAY reintroduce
      MOE-tier coverage under a per-school identifier check; framing
      preserved in design.md § Open Questions item 5 and DEPLOYMENT.md
      § Registry Evolution Process → Open question deferred.
- [ ] **P2/P3/P7 re-verification against real Convex harness** —
      BLOCKED ON UPSTREAM. Verified 2026-07-04 via the Convex Testing
      docs (<https://docs.convex.dev/testing/functions>): `convex-test`
      is Vitest-locked ("Use the convex-test library to test your
      functions in JS via the excellent Vitest testing framework"), and
      re-tooling the CampusCore PBT suite around Vitest would require
      adding Vitest as a devDependency — an AGENTS.md § "Approval
      Checkpoints" trigger. The current mirror-plus-stub approach
      (`convex/pairing.testStub.mjs` + inline handler mirrors + drift
      guards) is defensible: the stub enforces the same serializability
      contract Convex documents and the drift guards detect any handler
      change that could invalidate the mirror. Recheck in a future
      session if Convex ships a runner-agnostic testing harness.
      Source: <https://docs.convex.dev/testing/functions>.
