# Waiting on Human

> Single source of truth for everything that needs a human/dashboard/account
> action. The build never blocks on these — each is stubbed in code and the
> real requirement is listed here. Add to this file when new items are found.

## Session 3 Task 23 — Live deploy residuals (added 2026-07-05)

- [x] **`RESEND_FROM_EMAIL` (Convex_Env)** — RESOLVED 2026-07-06. Operator
      rotated the Resend API key to a full-access key; `GET /domains`
      returned `sgcampuscore.hong-yi.me` as `verified`. Set to
      `alerts@sgcampuscore.hong-yi.me` on both `elated-dogfish-303` and
      the project-level preview defaults, and mirrored into
      `.env.convex.local`. Escalation module now has full config.
- [x] **`RESEND_ESCALATION_TO` (Convex_Env)** — RESOLVED 2026-07-06. Set
      to `hello@hong-yi.me` on both `elated-dogfish-303` and the
      project-level preview defaults; mirrored into `.env.convex.local`.
      Note: the recipient sits on the `hong-yi.me` apex while the
      verified Resend sender is the `sgcampuscore.hong-yi.me`
      subdomain — fine on the recipient side, but the apex is not itself
      a verified Resend sender if a future flow ever wants to `From:`
      it. Live-send validation (tech_design §9, Pre-Demo Validation
      list) is still open below.
- [ ] **Vercel Production Convex deploy key.** Production still has an
      empty `CONVEX_DEPLOY_KEY` (intended fail-fast). Every deploy that
      Vercel targets to `production` — which currently includes any
      push to `main` — errors out at the Build Command until a
      `prod:hongyime:sgcampuscore|<key>` is generated and populated.
      Preview deploys succeed via a manual API redeploy (see the
      `.omo/redeploy2-body.json` shape). Session 3 ships Preview only
      by design; keeping this row open until Session 5 or later.
- [ ] **Custom-domain aliasing** — the sgcampuscore.hong-yi.me custom
      domain must be re-aliased to a green deployment each time one is
      cut, because Vercel's SSO covers every `*.vercel.app` URL under
      the `The Prawn Vercel` org. See DEPLOYMENT.md § "Deployment
      protection and the custom domain" for the aliasing curl. This is
      an operational chore, not a code change.

## Session 3 Addendum residuals (added 2026-07-06/07)

- [x] **postcss XSS via `npm overrides`** — RESOLVED 2026-07-07.
      Dependabot alert #1 (`postcss < 8.5.10`, XSS in unescaped
      `</style>` in the CSS stringifier, medium severity). Applied
      `"overrides": { "postcss": "^8.5.10" }` to `package.json`;
      lockfile re-resolved postcss to `8.5.16`. Same pass picked up
      `convex@1.42.1` and `ws@8.21.0` via natural re-resolve. Local
      `npm audit --audit-level=moderate` reports zero. Bundled with
      the fix: added `next-env.d.ts` to `eslint.config.mjs` ignores
      (the Next 15.5.19 → 15.5.20 bump auto-added a third triple-slash
      reference that `next/typescript`'s
      `@typescript-eslint/triple-slash-reference` rule flags as an
      error; Next's own docs say the file should not be linted).
- [ ] **Old `CLERK_JWT_ISSUER_DOMAIN` still set in Convex env** —
      Cleanup task. Convex env has both `CLERK_JWT_ISSUER_DOMAIN` and
      `CLERK_FRONTEND_API_URL` set to the same value, so no runtime
      effect. Remove the old key with
      `npx convex env remove CLERK_JWT_ISSUER_DOMAIN` on both
      `elated-dogfish-303` and the project-level preview defaults. Not
      urgent.
- [ ] **`hong-yi.me` apex not verified as a Resend sender** — Escalation
      currently `To:`-addresses `hello@hong-yi.me`, which works fine
      (Resend does not validate the recipient domain). Only the
      `sgcampuscore.hong-yi.me` subdomain is a verified `From:` sender.
      If a future flow ever needs to `From:` the apex, verify the apex
      domain in the Resend dashboard first.
- [ ] **Clerk Google social connection is on shared dev credentials** —
      Operator enabled Google + Microsoft social connections using
      Clerk's shared development credentials. Before the app goes live
      on a production Clerk instance, custom Google Cloud OAuth client
      credentials (and equivalent for Microsoft) must be provisioned
      and configured in the Clerk dashboard. Not urgent for Preview.
- [ ] **postcss 8.4.31 → 8.5.10 divergence from Next's tested tree** —
      Accepted risk once the `overrides` patch lands. Documented in
      STATUS.md § Session 3 Addendum § "postcss XSS via npm overrides."
      Reassess when Next 15.5.x publishes a patch release that bumps
      its postcss pin natively; the `overrides` entry can then be
      removed.
- [ ] **Dependabot auto-merge is DISABLED** — Both
      `.github/workflows/auto-merge-bots.yml` and
      `dependabot-auto-merge.yml` were deleted during the addendum
      cleanup (they used `gh pr merge --admin --squash`, which bypassed
      branch protection and caused 13 breaking merges to `main`).
      Every bot PR is now manual-review. Operator must periodically
      drain the open queue. First cycle after the postcss fix commits.

## Clerk hardening (added 2026-07-07)

- [ ] **`"Development mode"` watermark on the account portal.** The
      current Clerk instance is `renewed-fawn-5.clerk.accounts.dev` —
      a dev instance with `pk_test_*` / `sk_test_*` keys, which is
      why every account portal page carries a "Secured by Clerk ·
      Development mode" watermark. Creating a Clerk **production
      instance** (Clerk Dashboard → top-right instance switcher →
      "Create production instance"), swapping in the resulting
      `pk_live_*` / `sk_live_*` keys in Vercel Production scope, and
      pointing DNS at the production Clerk frontend URL will remove
      the watermark. Blocked on the "Prod Convex deploy key"
      residual — both belong to a future "go to Production" session,
      not Session 3.
- [ ] **User can add secondary email addresses via the account
      portal.** Clerk's built-in `<UserButton />` account portal
      exposes an "Add email address" affordance by default. This does
      NOT grant admin (the middleware Admin_Gate in `config/school.ts`
      only trusts the **primary** email against the allowlist and the
      staff-domain gate), so it's harmless today, but disable it at
      Clerk Dashboard → User & authentication → Email, phone, username
      → toggle **"Users can add additional email addresses to their
      account"** OFF before production.
- [ ] **User can connect multiple Google (and Microsoft) social
      accounts.** Same portal, same story. Not exploitable (only
      primary email is checked), but tighten Clerk Dashboard → User &
      authentication → SSO connections → each provider → Advanced →
      toggle **"Can be used to sign in AND connect to existing
      users"** OFF if you only want it as a sign-in method, not a
      "link another identity" method.
- [ ] **User can create per-account API keys via the portal.** Clerk
      exposes a per-user Machine-to-Machine token surface ("API keys"
      tab in the account portal). Almost certainly not wanted for
      campus users. Disable at Clerk Dashboard → User & authentication
      → Machine-to-machine tokens (or "API keys" — Clerk's UI may
      name it either way in dev vs prod instances) → toggle OFF.
      Alternatively hide the tab via Customization → Account Portal →
      disable the "API keys" section.
- [ ] **Restrict signups to school domain at the Clerk dashboard
      level.** Currently the middleware Admin_Gate is
      defense-in-depth — Clerk itself accepts any email address at
      signup. For a production Clerk instance, configure Clerk
      Dashboard → User & authentication → Restrictions → **Allowlist
      email domains** → add `@smu.edu.sg` (for the SMU deployment;
      each fork does this for its own school's domains). This is the
      AGENTS.md § "Clerk auth is restricted to `@smu.edu.sg` at the
      dashboard level" requirement — currently NOT enforced on the
      dev instance.

## Credentials & Keys (stubbed via .env.example)
- [ ] **Telegram** — bot token (via @BotFather) + webhook URL registration
      (`setWebhook` to the deployed Convex HTTP endpoint). Code path stubbed.
      Wiring is documented in DEPLOYMENT.md § "Telegram webhook wiring";
      the URL is `https://<convex-slug>.convex.site/telegram/webhook`.
- [ ] **Clerk** — instance publishable + secret keys, AND the per-school domain
      restriction (configured in the Clerk dashboard, not just in code). Each
      deployment restricts to ITS school's domains (see config/schoolRegistry.ts).
- [ ] **Clerk JWT template named `convex`** — Convex-side auth verification
      (`convex/auth.config.ts`) expects a Clerk JWT template with the exact
      name `convex`. Create it in Clerk Dashboard → JWT Templates → New
      Template → pick the "Convex" preset (or create a custom template named
      `convex` with the default Convex claim set). Not scriptable; must be
      done in the Clerk dashboard for each school's Clerk instance.
- [ ] **Google social connection in Clerk** — enable Google as a social
      connection in Clerk Dashboard → User & Authentication → Social
      Connections, so a school user can sign in with their institutional
      Google Workspace account. Per-school Clerk instance, per-school
      dashboard toggle.
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
