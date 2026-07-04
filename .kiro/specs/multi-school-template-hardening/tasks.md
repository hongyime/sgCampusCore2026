# Implementation Plan: Multi-School Template Hardening

## Overview

Hardening pass for the per-school CampusCore template. Ratifies the design's
seven surfaces (Registry accuracy, predicate audit, admin fail-closed, 30-day
gate boundary, pairing entropy floor, registry evolution, fork-and-adopt UX)
into runnable code + tests + documentation. This spec does **not** change
runtime behavior of any AGENTS.md invariant (Requirement 12).

Language: TypeScript (existing Next.js/Convex codebase).
Test tooling: `fast-check` (property tests, P1–P7) + `node --test` (unit tests
for registry shape and predicate edge cases). `fast-check` is added as a
devDependency under an AGENTS.md § "Approval Checkpoints" exception, recorded
in Requirement 11 and re-affirmed in Task 1.1's PR (R11.2).

**Session-3 boundary:** Session-3 (`session-3-unblock-and-landing`) ships
Convex codegen, promo landing, `DEPLOYMENT.md` creation, and the first Vercel
Preview. This spec assumes those artifacts exist. All `DEPLOYMENT.md` work in
Wave 4–8 is **append-only** onto Session-3's file — no rewrite.

**Non-agent gates:** The 8 `// verify` Registry entries (R1.6) require access
to each school's IT portal or a current student account. Those tasks produce
`WAITING_ON_HUMAN.md` rows (Task 1.5), not phone calls.

## Tasks

- [x] 1. Materialize AGENTS.md approvals and code hardening
  - [x] 1.1 Pin `fast-check` as an exact-version devDependency in `package.json`
    - Add `"fast-check": "3.23.2"` (no `^`, no `~`) to `devDependencies` only
      — never to `dependencies`. Do not touch any other dependency entry.
    - Add `"test:pbt": "node --test config/**/*.property.test.mjs convex/**/*.property.test.mjs"`
      to `scripts` (complements Session-3's `test:unit`).
    - Re-affirm the AGENTS.md § "Approval Checkpoints" exception in the PR
      description: "`fast-check` approved by repo owner per Requirement 11.2,
      devDependency only, no runtime impact, no free-tier cost implications."
    - _Requirements: 11.1, 11.2, 11.3, 11.5_
    - _Design: § Dependencies, § Testing Strategy — Property-Based Testing_

  - [x] 1.2 Add optional additive fields and `REGISTRY_SCHEMA_VERSION` to `config/schoolRegistry.ts`
    - Extend `SchoolEntry` with optional `shortName?: string` and
      `verified?: { at: number; by: string; source: string }` — additive only,
      no required field removed or renamed (R1.3, R1.4, § LLD-1 Step 2).
    - Export `export const REGISTRY_SCHEMA_VERSION = 1;` at the top of the
      module. Add a source comment explaining the bump rule: increment only
      on required-field removal, rename, or semantic change; do NOT increment
      for new optional fields or new entries (R1.7, § LLD-1 Step 4).
    - Keep the `SCHOOL_REGISTRY` array typed as `readonly` — the existing
      `readonly SchoolEntry[]` annotation is sufficient (R1.8).
    - Do NOT populate `verified` blocks or remove any `// verify` comment in
      this task; that gates on Task 1.5's human verification (R1.6).
    - _Requirements: 1.3, 1.4, 1.7, 1.8_
    - _Design: § Component 1 (additive fields table), § LLD-1 Steps 2 and 4_

  - [x] 1.3 Fix the trim-then-lowercase pipeline in `emailDomain` (`config/school.ts`)
    - Change `emailDomain` to trim the input before slicing at the last `@`
      and before lowercasing (R2.2, § LLD-2 aggregate fix list item 1).
    - Change `isAdminEmail` to trim before lowercasing so the local variable
      `normalized = email.trim().toLowerCase()` matches the allowlist
      normalization pipeline (§ LLD-2 table row: "Trim is currently absent.
      Fix: trim before lowercase.").
    - Keep the multi-`@` behavior as `lastIndexOf("@")` — this is the
      RFC-permitted interpretation and matches Clerk's parser (R2.5,
      § LLD-2 table row 1). Do NOT switch to `indexOf`.
    - Do NOT deduplicate `getAdminAllowlist()` output — duplicates are
      preserved by design (R3.4, § LLD-4).
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 3.4_
    - _Design: § LLD-2 aggregate fix list, § LLD-4 documented behavior_

  - [x] 1.4 Document the pairing-token entropy floor in `convex/pairing.ts`
    - Add a code comment immediately above the
      `const token = crypto.randomUUID().replace(/-/g, "");` line stating:
      "Entropy floor: >=128 bits from Web Crypto CSPRNG. `crypto.randomUUID()`
      yields 122 bits from a v4 UUID (accepted lower bound per Requirement
      5.4 and design § LLD-3). Preferred alternative:
      `hexEncode(crypto.getRandomValues(new Uint8Array(16)))` for a clean 128
      bits. `Math.random` is explicitly forbidden."
    - Do NOT migrate to the preferred form in this task — the design permits
      both, Requirement 5.4 accepts the current form with the comment, and a
      migration would need its own PBT run to prove no regression. This task
      is comment-only.
    - _Requirements: 5.3, 5.4_
    - _Design: § LLD-3, § Security Considerations "Entropy floor for pairing tokens"_

  - [x] 1.5 File 8 `WAITING_ON_HUMAN.md` entries for `// verify` Registry domains
    - Append a new section titled
      `## Registry Domain Verification (multi-school-template-hardening, R1.6)`
      after the existing "Credentials & Keys" section in
      `x:\01 REPOSITORIES\sgCampusCore2026\WAITING_ON_HUMAN.md`.
    - Add one unchecked checkbox per school code, each naming the specific
      school, the current unverified student domain, and the acceptance
      criterion for closing the row (independent confirmation via school IT
      portal or current student account, PR removes `// verify` comment,
      PR adds a populated `verified` block per Task 1.2's shape).
    - The 8 rows are: `sit` (singaporetech.edu.sg), `suss` (suss.edu.sg),
      `np` (student.np.edu.sg), `sp` (ichat.sp.edu.sg), `tp`
      (student.tp.edu.sg), `nyp` (stu.nyp.edu.sg), `rp` (myrp.edu.sg),
      `ite` (ite.edu.sg). These match the current comments in
      `config/schoolRegistry.ts` verbatim.
    - Explicitly annotate the section: "Autonomous agents cannot perform
      this verification — requires school IT portal access or a current
      student account per design.md § LLD-1 Step 1."
    - _Requirements: 1.6_
    - _Design: § LLD-1 Step 1 (Sources of truth), § Error Scenario 3_

- [x] 2. Static and example-based tests (`node --test`)
  - [x] 2.1 Write Registry static shape test at `config/schoolRegistry.test.mjs`
    - New file using `import { test } from 'node:test'` and
      `import { strict as assert } from 'node:assert'`. No new devDependency
      required (Node built-in).
    - Import `SCHOOL_REGISTRY` and `REGISTRY_SCHEMA_VERSION` from
      `./schoolRegistry.ts`.
    - Assertions:
      - `test('every SchoolEntry code is unique')` — build a `Set` of codes,
        assert `set.size === SCHOOL_REGISTRY.length` (R1.1, P6 example-based
        companion to the property test in 3.4).
      - `test('every studentDomains and staffDomains entry is lowercase, non-empty, and contains no @')`
        — flatten all domains, assert each `d === d.toLowerCase()` and
        `d.length > 0` and `!d.includes("@")` (R1.2).
      - `test('every entry has verified block OR // verify comment in source')`
        — read `config/schoolRegistry.ts` as text via
        `fs.readFileSync(new URL('./schoolRegistry.ts', import.meta.url))`,
        for each entry without a `verified` field assert the file contains
        `// verify` within 6 lines of that entry's `code:` occurrence
        (R1.5, § LLD-1 Step 3 last bullet).
      - `test('REGISTRY_SCHEMA_VERSION is an integer >= 1')` (R1.7).
    - Wire into the existing `test:unit` script from Session-3 Task 5
      (`node --test config/**/*.test.mjs convex/**/*.test.mjs`).
    - _Requirements: 1.1, 1.2, 1.5, 1.7_
    - _Design: § LLD-1 Step 3, § Testing Strategy — Unit Testing Approach
      (`findSchoolByCode`, `acceptedDomainsForSchool` rows)_

  - [x] 2.2 Write example-based predicate edge-case unit tests at `config/school.hardening.test.mjs`
    - New file — deliberately NOT extending Session-3's `config/school.test.mjs`
      because that file is under Session-3 scope and this spec's edge cases
      (trim, whitespace, multi-`@`, malformed allowlist tokens) belong to
      this spec's Requirement 2 audit.
    - Save and restore `process.env` around each case (same pattern as
      Session-3 Task 5).
    - Assertions across `isSchoolMemberEmail`, `isStaffEmail`, `isAdminEmail`,
      `getAdminAllowlist`:
      - Empty input string returns `false` for all three predicates (R2.3).
      - Input with no `@` after trimming returns `false` (R2.4).
      - Whitespace-padded input `"  staff@smu.edu.sg  "` returns the same
        result as the trimmed form (R2.2, verifies Task 1.3's fix).
      - Multi-`@` input `"a@b@smu.edu.sg"` treats `smu.edu.sg` as the domain
        (R2.5).
      - Malformed allowlist token (no `@`) is retained in the parsed array
        but never matches a well-formed JWT email (R3.5).
      - `CAMPUSCORE_ADMIN_ALLOWLIST` with duplicate entries preserves both
        occurrences in the returned array (R3.4).
      - Newline/comma/space-mixed allowlist parses identically to the
        comma-separated form (R3.3, § LLD-4 examples).
    - Assertions across the two-layer defense-in-depth boundary:
      - Staff-domain-only email with empty allowlist returns `false`
        from `isAdminEmail` (R3.1 example-based companion to P1).
      - Non-staff-domain email listed in the allowlist returns `false`
        from `isAdminEmail` (R3.6).
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 3.4, 3.5, 3.6_
    - _Design: § LLD-2 aggregate fix list, § LLD-4, § Testing Strategy —
      Unit Testing Approach_

  - [x] 2.3 Build an in-memory Convex mutation stub for P2/P3/P7 property tests
    - New file `convex/pairing.testStub.mjs` (co-located so `.mjs` test files
      in `convex/` can import it with a relative path).
    - Export a factory `createStubCtx({ now, users, pairings })` that returns
      a minimal `ctx` object shaped like Convex's `MutationCtx` for the two
      tables actually touched:
      - `ctx.db.query("pairings").withIndex("by_token", q => q.eq("token", t)).unique()`
        returns the matching row or `null` from the in-memory `pairings` map.
      - `ctx.db.query("users").withIndex("by_telegram_user", ...).unique()`
        and `.withIndex("by_clerk_user", ...).unique()` behave the same way
        against the in-memory `users` map.
      - `ctx.db.insert(table, row)` and `ctx.db.patch(id, partial)` mutate
        the in-memory maps synchronously (fast-check runs many iterations;
        no real I/O).
      - `ctx.auth.getUserIdentity()` returns a caller-supplied identity.
    - The stub SHALL enforce serializability at the granularity of one
      mutation call (single-threaded JS = no interleaving mid-mutation)
      because that is what Convex actually provides (§ Algorithm
      `redeemPairingToken` comment: "Convex mutations are serializable").
      This makes P2 (single-use) provable against the stub.
    - Do NOT stub `crypto.randomUUID` — property tests should use the real
      Web Crypto so the entropy path is exercised.
    - Do NOT try to model network retries, egress queue, scheduler, or any
      table other than `pairings` and `users` — those are out of this
      spec's scope (AGENTS.md workspace/scope limits: "keep failure
      domains separate").
    - _Requirements: (test infrastructure supporting 5.1, 5.2, 4.1)_
    - _Design: § Algorithm `redeemPairingToken` serializability note,
      § Testing Strategy — Property-Based Testing "Requires the Convex
      test harness or a serializable in-memory stub"_

- [x] 3. Property-based tests P1–P7 (`fast-check` at ≥100 iterations, pinned exact version)
  - [x] 3.1 Write P1 property test at `config/isAdminEmail.p1.property.test.mjs`
    - **Property 1: Fail-closed admin.**
    - **Validates: Requirements 3.1, 12.8** (design.md § Correctness
      Properties P1, § Auth Model fail-closed invariant).
    - Formal statement:
      `∀ E ∈ String, allowlist(env) = ∅ ⟹ isAdminEmail(E) = false`.
    - Implementation:
      - `import fc from 'fast-check';`
      - Save `process.env.CAMPUSCORE_ADMIN_ALLOWLIST` in `beforeEach`;
        restore in `afterEach`. Also set `CAMPUSCORE_SCHOOL_CODE='smu'`
        for determinism.
      - For each iteration set the env to one of `""`, `"   "`, `"\n\t"`,
        `",,,, "`, `undefined` (via `delete`) as an oracle set of
        "empty-equivalent" values; assert `isAdminEmail(email) === false`.
      - Use `fc.string()` as the arbitrary email generator.
    - Configuration: `fc.assert(fc.property(...), { numRuns: 100 })` — 100
      iterations minimum (R11.4).
    - _Requirements: 3.1, 12.8_
    - _Design: § Correctness Properties — Property 1, § LLD-4_

  - [x] 3.2 Write P4 property test at `config/isAdminEmail.p4.property.test.mjs`
    - **Property 4: Staff-domain necessary for admin.**
    - **Validates: Requirements 3.2** (design.md § Correctness Properties
      P4, § Auth Model algorithm).
    - Formal statement:
      `∀ E ∈ String, isAdminEmail(E) = true ⟹ domainOf(E) ∈ getActiveSchool().staffDomains`.
    - Implementation:
      - Set `CAMPUSCORE_SCHOOL_CODE='smu'` and
        `CAMPUSCORE_ADMIN_ALLOWLIST` to a fixed non-empty set including at
        least one staff email and at least one deliberately-non-staff email
        (e.g., `student@u.nus.edu`).
      - Arbitrary: `fc.emailAddress()` (fast-check built-in).
      - Property: if `isAdminEmail(email) === true`, then
        `smu.staffDomains.includes(emailDomain(email))` must be `true`.
        Use an implication guard via `fc.pre(...)` OR filter inside the
        predicate, per fast-check documentation for conditional properties.
    - Configuration: `numRuns: 100` (R11.4).
    - _Requirements: 3.2_
    - _Design: § Correctness Properties — Property 4, § Algorithm
      `isAdminEmail`_

  - [x] 3.3 Write P5 property test at `config/isSchoolMemberEmail.p5.property.test.mjs`
    - **Property 5: Case insensitivity in local-part.**
    - **Validates: Requirements 2.1** (design.md § Correctness Properties
      P5, § LLD-2 aggregate fix list).
    - Formal statement:
      `∀ E ∈ String, ∀ σ case-transformations of local-part,
       isSchoolMemberEmail(E) = isSchoolMemberEmail(σ(E))`.
    - Implementation:
      - Set `CAMPUSCORE_SCHOOL_CODE='smu'`.
      - Generate an email as tuple `(localPart, domain)` where `domain` is
        drawn from `SCHOOL_REGISTRY[smu].studentDomains ∪ staffDomains`
        for a meaningful fraction of iterations, and from an out-of-registry
        domain for the rest (to exercise both `true` and `false` outcomes).
      - Generate a case transformation `σ` as a random mapping over the
        local-part characters (uppercase / lowercase / random-flip).
      - Assert `isSchoolMemberEmail(local + "@" + domain) === isSchoolMemberEmail(σ(local) + "@" + domain)`.
    - Configuration: `numRuns: 100` (R11.4).
    - _Requirements: 2.1_
    - _Design: § Correctness Properties — Property 5, § LLD-2_

  - [x] 3.4 Write P6 property test at `config/schoolRegistry.p6.property.test.mjs`
    - **Property 6: Registry uniqueness.**
    - **Validates: Requirements 1.1** (design.md § Correctness Properties
      P6, § Registry Contract invariants).
    - Formal statement:
      `∀ (A, B) ∈ SCHOOL_REGISTRY × SCHOOL_REGISTRY, A ≠ B ⟹ A.code ≠ B.code`.
    - Implementation:
      - Static-input property: iterate all pairs via
        `fc.tuple(fc.integer(...), fc.integer(...))` indexed into
        `SCHOOL_REGISTRY`, with `fc.pre(i !== j)` to skip identity pairs.
      - Assert `SCHOOL_REGISTRY[i].code !== SCHOOL_REGISTRY[j].code`.
    - This is the property-based companion to the example-based static test
      in 2.1 (design.md § Testing Strategy: "natural to express as a for
      all pairs (A,B) property").
    - Configuration: `numRuns: 100` (R11.4). At current 12 entries, 100
      random pair samples covers the space with high overlap; both P6 and
      2.1 pass together or neither does.
    - _Requirements: 1.1_
    - _Design: § Correctness Properties — Property 6_

  - [x] 3.5 Write P2 property test at `convex/pairing.p2.property.test.mjs`
    - **Property 2: Pairing single-use.**
    - **Validates: Requirements 5.1, 12.9** (design.md § Correctness
      Properties P2, § Algorithm `redeemPairingToken`, § Error Scenario 5).
    - Formal statement:
      `∀ T, ∀ finite sequence of redeemPairingToken(T, *) calls,
       |{ r : r.ok = true }| ≤ 1`.
    - Implementation:
      - `import { createStubCtx } from './pairing.testStub.mjs';`
      - `import { redeemPairingToken } from './pairing.ts';` — call the
        `handler` function directly against the stub `ctx`.
      - Arbitrary: `fc.array(fc.string(), { minLength: 2, maxLength: 20 })`
        generating a sequence of `telegram_user_id` values to attempt
        redemption with.
      - Seed the stub with one pending `pairings` row for a fixed token.
      - Invoke `handler(stubCtx, { token, telegram_user_id: id })` for each
        id in the sequence; collect results.
      - Assert `results.filter(r => r.ok === true).length <= 1`.
    - Configuration: `numRuns: 100` (R11.4).
    - _Requirements: 5.1, 12.9_
    - _Design: § Correctness Properties — Property 2, § Algorithm
      `redeemPairingToken` serializability note_

  - [x] 3.6 Write P3 property test at `convex/pairing.p3.property.test.mjs`
    - **Property 3: Pairing TTL.**
    - **Validates: Requirements 5.2** (design.md § Correctness Properties
      P3, § Algorithm `redeemPairingToken`).
    - Formal statement:
      `∀ T minted at t0, ∀ t > t0 + PAIRING_TTL_MS,
       redeemPairingToken(T, *) at t returns { ok: false, reason: "expired" }`.
    - Implementation:
      - Arbitrary: `fc.integer({ min: 180001, max: 30 * 24 * 60 * 60 * 1000 })`
        for `dt` (any value strictly greater than `PAIRING_TTL_MS = 180_000`,
        bounded above by 30 days to keep the test space realistic).
      - Seed stub with a pending row at `created_at = t0`,
        `expires_at = t0 + 180_000`. Override the stub's clock so
        `Date.now()` returns `t0 + dt` during the redemption call.
      - Assert result is `{ ok: false, reason: "expired" }`.
    - Configuration: `numRuns: 100` (R11.4).
    - _Requirements: 5.2_
    - _Design: § Correctness Properties — Property 3, § LLD-3 (indirect —
      TTL is fixed at 180_000)_

  - [x] 3.7 Write P7 property test at `convex/verification.p7.property.test.mjs`
    - **Property 7: 30-day gate one-shot.**
    - **Validates: Requirements 4.1, 12.10** (design.md § Correctness
      Properties P7, § LLD-5 boundary conditions).
    - Formal statement:
      `∀ paired user U, ∀ t1 with t1 - U.last_verified_at > REVERIFY_TTL_MS,
       ∀ t2 ∈ [t1, t3) where t3 = time of next successful
       redeemPairingToken(_, U.tg_id):
         checkVerification(t2) = { verified: false, reason: "stale" };
       AND checkVerification(t3 + ε) = { verified: true, ... }`.
    - Implementation:
      - Seed stub with one `users` row at `last_verified_at = 0`.
      - Arbitrary: `fc.integer({ min: REVERIFY_TTL_MS + 1, max: REVERIFY_TTL_MS * 10 })`
        for `t1` (any moment past the 30-day boundary).
      - Assert `checkVerification(stubCtx, telegram_user_id)` returns
        `stale` at `t1`.
      - Advance stub clock to `t3`, insert a fresh pending pairing, call
        `redeemPairingToken` (which upserts the user's `last_verified_at`
        to `t3`).
      - Assert `checkVerification` at `t3 + 1` returns `verified: true`
        with the correct `clerk_user_id`.
      - Additional assertion: the strict-`>` boundary (R4.5) — at exact
        `t1 = last_verified_at + REVERIFY_TTL_MS`, the result must be
        `verified: true` (this is one example-based case bolted onto the
        property, not a separate test).
    - Configuration: `numRuns: 100` (R11.4).
    - _Requirements: 4.1, 12.10_
    - _Design: § Correctness Properties — Property 7, § LLD-5 (three-state
      table + boundary conditions)_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `npm run test:unit` and `npm run test:pbt` locally in the
    Session-3 Local_Mirror (non-UNC path). Both must exit 0.
  - Run `npm run typecheck` — `SchoolEntry` optional-field additions
    from Task 1.2 must not break existing consumers in
    `config/school.ts`, `middleware.ts`, or `convex/pairing.ts`.
  - Run `npm run lint`. Fix any regressions caused by the trim edit or
    the entropy-comment edit.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Extend `DEPLOYMENT.md` with per-school hardening runbooks (append-only onto Session-3's file)
  - [x] 5.1 Append the Fork-and-Adopt Runbook section (R8)
    - Insert as a new top-level `## Fork-and-Adopt Runbook (per-school
      operator handoff)` section after Session-3's DEPLOYMENT.md ends
      (do not rewrite Session-3's content).
    - Sub-sections in this exact order (mirrors § LLD-7):
      - **What the school administrator authorizes before engineering starts**
        — enumerate: third-party service account authority (Clerk,
        Convex, Vercel, Telegram, Resend, Groq); confirmation of the
        school's canonical student and staff email domains against the
        Registry; the 2–5 initial admin staff emails for
        `CAMPUSCORE_ADMIN_ALLOWLIST`; deployment domain choice (R8.1).
      - **Seven one-time engineering setup steps** — (a) fork the repo;
        (b) verify or add the school's `SchoolEntry` (points at
        Requirement 7 / § LLD-8); (c) create the Clerk_Instance with
        Google OAuth, dashboard allowed-sign-up domains equal to
        `studentDomains ∪ staffDomains`, and a JWT template named
        `convex`; (d) create the Convex project and set every
        Convex-side env var; (e) create the Telegram bot with a
        webhook secret and register the webhook against Convex;
        (f) create the Vercel project with every Vercel-side env var;
        (g) run the four end-to-end verifications (student sign-in,
        pairing round-trip, admin sign-in, non-admin 403) (R8.2).
      - **Ongoing per-school maintenance** — annual
        `TELEGRAM_WEBHOOK_SECRET` rotation (pointer to §5.4); bot token
        rotation on bot-admin departure; admin changes via
        `CAMPUSCORE_ADMIN_ALLOWLIST` edit plus redeploy (pointer to
        §5.2); periodic upstream pull for security fixes and Registry
        updates (R8.3).
      - **Two-layer domain restriction reminder** — Layer 1 (Clerk
        dashboard allowed-sign-up domains) is authoritative; Layer 2
        (`middleware.ts`) is defense-in-depth; both must be configured
        (R8.4, § Auth Model, § Error Scenario 6).
      - **Environment variable reference table** — every variable from
        § "Environment variable contract" with its runtime (Next.js,
        Convex, or both), required status, and sensitive flag (R8.5).
        Do NOT include real secret values. Placeholders must be
        obviously fake (matches Session-3 Task 20 rule).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
    - _Design: § LLD-7_

  - [x] 5.2 Append the Admin Auth Lifecycle Process section (R6)
    - New section `## Admin Auth Lifecycle (onboard / rotate / revoke)`
      after §5.1's Fork Runbook.
    - Content (mirrors § LLD-9):
      - **Onboarding an admin**: append the target staff email to
        `CAMPUSCORE_ADMIN_ALLOWLIST` in BOTH the Vercel env and the
        Convex env; redeploy. No schema migration, no runtime mutation
        (R6.1).
      - **Rotating or revoking an admin**: remove the target email from
        `CAMPUSCORE_ADMIN_ALLOWLIST` in both environments; redeploy.
        The revoked email's next request to any `/admin/*` route
        returns HTTP 403 on the following request cycle (R6.2).
      - **No admin table exists**: no `admins` table, no
        `_admin_grants` table, no superadmin distinction — all
        allowlist entries are peers (R6.3).
      - **Why env vars, not a database**: enumerate the three
        properties this preserves — auditability via env-history;
        no self-service escalation surface; fail-closed simplicity —
        so a future contributor proposing a database-backed admin
        model has a written cost/benefit to counter (R6.4).
      - **Env var mirroring rule**: `CAMPUSCORE_ADMIN_ALLOWLIST` must
        be set identically in both the Next.js runtime env and the
        Convex runtime env; these are separate processes with separate
        `process.env` (R6.5, § Environment variable contract).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
    - _Design: § LLD-9_

  - [ ] 5.3 Append the Registry Evolution Process section (R7)
    - New section `## Registry Evolution Process (adding / updating / no
      runtime override)` after §5.2.
    - Content (mirrors § LLD-8):
      - **Adding a new school**: upstream PR that adds a
        `SchoolEntry` with a populated `verified` block (source URLs
        and reviewer handle); `npm run test:unit` and `npm run test:pbt`
        (which cover the Registry_Static_Test) must pass before merge
        (R7.1).
      - **Updating an existing school's domain**: upstream PR adds the
        new domain to the appropriate array (student or staff); the
        previous domain is retained for a documented grace period
        marked by a `// deprecated: retire after <date>` comment
        until the school explicitly retires it (R7.2, § Error
        Scenario 4).
      - **Runtime override: none**. There SHALL be no environment
        variable or configuration file that patches Registry contents
        at deploy time. A school with an urgent change ahead of an
        upstream merge patches the file in its own fork (R7.3).
      - **Downstream propagation**: downstream deployments receive new
        Registry entries only via periodic upstream pull, and an entry
        is only *used* if `CAMPUSCORE_SCHOOL_CODE` matches its `code`
        (R7.4).
      - **Open question deferred**: MOE school code granularity —
        whether a specific JC or secondary school sharing
        `students.edu.sg` warrants a per-school entry distinguished
        by a school-owned identifier — deferred to a future spec
        (R7.5, § Open Questions item 5).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
    - _Design: § LLD-8, § Error Scenario 4_

  - [ ] 5.4 Append the Telegram Webhook Rotation Process section (R9)
    - New section `## Telegram Webhook Secret Rotation` after §5.3.
    - Content (mirrors § LLD-6):
      - **Single-secret rotation sequence** (5 steps): (a) generate
        `S_new` via `openssl rand -hex 32`; (b) call Telegram Bot API
        `setWebhook` with the same URL and `secret_token: S_new`;
        (c) `npx convex env set TELEGRAM_WEBHOOK_SECRET S_new`;
        (d) redeploy Convex; (e) verify with a test message (R9.1).
      - **Propagation window**: during the ~1–2 seconds between
        Convex env set and Convex hot-reload, updates presenting
        `S_new` may be temporarily rejected; Telegram retries with
        exponential backoff make this safe — no data loss (R9.2).
      - **Dual-secret variant (deferred)**: comma-separated
        `TELEGRAM_WEBHOOK_SECRETS` env with any-of match — documented
        here as an explicit future refinement, NOT implemented in this
        spec (R9.3).
      - **Rejection on mismatch**: any Telegram update whose
        `X-Telegram-Bot-Api-Secret-Token` header does not equal the
        current `TELEGRAM_WEBHOOK_SECRET` env value is rejected by
        the Convex webhook handler (R9.4). Note: this ratifies
        existing behavior; this spec does not add new code to the
        webhook.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
    - _Design: § LLD-6, § Security Considerations_

  - [ ] 5.5 Append the Data Isolation Boundary invariant section (R10)
    - New section `## Data Isolation Boundary (one deployment per school)`
      after §5.4.
    - Content (mirrors § LLD-10 and § Deployment Topology):
      - **Tenancy unit**: one Convex project + one Vercel project +
        one Clerk_Instance + one Telegram bot serves exactly one
        school, selected by `CAMPUSCORE_SCHOOL_CODE` (R10.1).
      - **No `school_id` column**: `convex/schema.ts` does not
        contain a `school_id` field on any table; cross-school data
        mixing is structurally impossible because per-school databases
        are separate Convex projects (R10.2).
      - **Reopening the door requires a new spec**: any proposal to
        reintroduce `school_id` requires a separate spec addressing
        the four risks — cross-tenant leak blast radius, quota
        accounting, delete-my-school-cleanly, PDPA compliance
        separation (R10.3, § LLD-10).
      - **Single-school request scope**: no runtime code path
        enumerates entries for more than one school in a single
        request; the Registry, Admin_Predicate, and Member_Predicate
        all read from `getActiveSchool()` (R10.4).
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
    - _Design: § Deployment Topology, § Data Models, § LLD-10_

- [ ] 6. Final checkpoint — Full-suite verification and AGENTS.md invariant audit
  - Re-run `npm run test:unit && npm run test:pbt && npm run typecheck &&
    npm run lint && npm run build` from the Local_Mirror. All must exit 0.
  - Grep the diff for any change to the reaper TTL, `retry_count`,
    hazard lexicon, NSFW cutoff (0.50), 60-second SLA, `priority_tier`
    write path, `pending_review` state, or `/api/legal-escalation`
    endpoint. Any hit is a failure of Requirement 12 and must be
    reverted before merge.
  - Confirm `package.json` diff contains exactly one added line
    (`"fast-check": "3.23.2"`) and one added script (`"test:pbt": ...`);
    no other dependency touched (R11.3).
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Session close — hygiene updates
  - [ ] 7.1 Overwrite `STATUS.md` with the hardening session's outcomes
    - Overwrite per file convention: "As of: multi-school-template-
      hardening — Registry hardened, predicate audit closed, P1–P7
      property tests green, per-school runbook appended to
      DEPLOYMENT.md."
    - Include: done-this-session bullets (Tasks 1.x through 5.x); test
      evidence (unit-test and PBT exit codes); the 8 open
      `WAITING_ON_HUMAN.md` rows for Registry domain verification;
      any AGENTS.md-invariant items reviewed and confirmed unchanged.
    - _Requirements: (session hygiene; supports 11.2 audit trail)_

  - [ ] 7.2 Append to `WAITING_ON_HUMAN.md` any residuals from this session
    - Append at the bottom of the file (do NOT touch the 8-row
      section from Task 1.5): items that remain open at session close
      — e.g., migration to the preferred 128-bit token form (deferred
      per Task 1.4), dual-secret webhook variant (R9.3), MOE school
      code granularity open question (R7.5), any P2/P3/P7 property
      test flakes that need re-review under a real Convex harness.
    - Do NOT re-check any pre-existing row from Session 1 / Session 3;
      those belong to their owning specs.
    - _Requirements: 9.3, 7.5_

  - [ ] 7.3 Add and tick new TASK-N rows in root `TASKS.md` for this spec
    - Append a new `## Multi-School Template Hardening (Session 4)`
      section at the bottom of `x:\01 REPOSITORIES\sgCampusCore2026\TASKS.md`
      (after the "Session 3" section).
    - Add rows numbered continuing from the current highest TASK-47
      (start at TASK-48). Suggested row mapping (adjust if numbering
      collides at commit time):
      - TASK-48: `config/schoolRegistry.ts` — additive optional fields
        (`shortName`, `verified`) + exported `REGISTRY_SCHEMA_VERSION`
        (Task 1.2, R1.3/1.4/1.7/1.8).
      - TASK-49: `config/school.ts` — predicate trim-then-lowercase fix
        (Task 1.3, R2.2/2.6).
      - TASK-50: `convex/pairing.ts` — entropy floor code comment
        (Task 1.4, R5.3/5.4).
      - TASK-51: Registry static test + predicate example-based unit
        tests (Tasks 2.1/2.2, R1.1/1.2/1.5/1.7 + R2.3–2.6, R3.1/3.3–3.6).
      - TASK-52: `fast-check` devDependency (exact pin) + P1–P7
        property tests + Convex mutation in-memory stub (Tasks
        1.1/2.3/3.1–3.7, R11.1–11.5 + R1.1/2.1/3.1/3.2/4.1/5.1/5.2).
      - TASK-53: `DEPLOYMENT.md` hardening appends — Fork Runbook,
        Admin Lifecycle, Registry Evolution, Webhook Rotation, Data
        Isolation (Tasks 5.1–5.5, R6–R10).
      - TASK-54: `WAITING_ON_HUMAN.md` — 8 Registry domain verification
        rows filed (Task 1.5, R1.6).
    - Tick each row (`- [x]`) in the same commit that completes its
      underlying task, per the root TASKS.md convention.
    - _Requirements: (session hygiene; supports the "audit trail via
      env-history" property in R6.4 by keeping the task ledger honest)_

## Notes

- Tasks marked `*` are optional and can be skipped for a faster MVP, but
  Requirement 11 (approved `fast-check`) exists so P1–P7 CAN be run.
  Skipping them undermines the "hardening" framing of this spec.
- Task 1.1 (`fast-check` devDep add) is non-optional because it
  materializes the AGENTS.md § "Approval Checkpoints" exception the user
  granted. Skipping 1.1 makes every task under section 3 unrunnable.
- Task 1.5 (`WAITING_ON_HUMAN.md` 8-row filing) is non-optional because
  R1.6 explicitly gates on those human confirmations. The rows are the
  contract — clearing them is what a future session picks up.
- All `DEPLOYMENT.md` work is APPEND onto Session-3's file. If Session-3
  hasn't landed by the time this spec runs, halt at Wave 4 and flag
  Session-3 as a blocker; do not attempt to rewrite Session-3's promo
  or Convex-codegen sections.
- Property test iteration count (`numRuns: 100`) satisfies R11.4's
  "≥100 iterations per property test" floor. Individual tests may raise
  this locally if a bug is suspected, but the committed default is 100
  to keep CI fast.
- Every AGENTS.md invariant listed in Requirement 12 is a hard non-goal.
  Task 6 audits the diff for accidental drift into those areas before
  the session closes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["3.5", "3.6", "3.7"] },
    { "id": 3, "tasks": ["5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["5.3"] },
    { "id": 6, "tasks": ["5.4"] },
    { "id": 7, "tasks": ["5.5"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```

**Wave rationale (why tasks in each wave are concurrency-safe):**

- **Wave 0** — Five independent code / doc edits that each touch a
  distinct file: `package.json` (1.1), `config/schoolRegistry.ts` (1.2),
  `config/school.ts` (1.3), `convex/pairing.ts` (1.4),
  `WAITING_ON_HUMAN.md` (1.5). No file collision → safe in parallel.
- **Wave 1** — Seven new test files that read the code from Wave 0 but
  don't write to any Wave-0-owned file. `config/schoolRegistry.test.mjs`
  (2.1), `config/school.hardening.test.mjs` (2.2),
  `convex/pairing.testStub.mjs` (2.3), plus the four predicate-side
  property tests (3.1 P1, 3.2 P4, 3.3 P5, 3.4 P6) each in its own file
  under `config/`. Each task creates a distinct new file → safe in
  parallel; each depends on Wave 0 completing so the code under test
  has the trim fix, additive fields, and entropy comment.
- **Wave 2** — Three Convex-side property tests (3.5 P2, 3.6 P3, 3.7 P7)
  each in its own new file under `convex/`. All three depend on the
  stub built in 2.3. No inter-task file collision → safe in parallel.
- **Waves 3–7** — Five sequential `DEPLOYMENT.md` appends. All five
  touch the same file, so wave-schedule rule (same file = different
  waves) forces serialization. Order is Fork Runbook → Admin Lifecycle
  → Registry Evolution → Webhook Rotation → Data Isolation, matching
  the natural narrative flow of the runbook.
- **Wave 8** — Three session-close edits: `STATUS.md` (7.1),
  `WAITING_ON_HUMAN.md` (7.2), and root `TASKS.md` (7.3). Three
  distinct files → safe in parallel. Depends on all prior waves so
  the session-close record is complete.

Checkpoints (Task 4 and Task 6) and top-level parents (Tasks 1, 2, 3, 5,
7) are intentionally omitted from the dependency graph per the wave-
graph rules — only leaf sub-tasks are scheduled.

## Workflow Completion

This workflow produces design and planning artifacts only. Implementation
begins when a user opens `tasks.md` and clicks "Start task" next to the
first task item. Do not attempt to execute Tasks 1.1+ as part of the
spec-creation workflow.
