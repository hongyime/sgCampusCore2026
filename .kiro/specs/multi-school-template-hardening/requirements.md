# Requirements Document

## Introduction

This spec is the **hardening pass** for CampusCore's per-school template. The
scaffold — `config/schoolRegistry.ts`, `config/school.ts`, `middleware.ts`,
`convex/pairing.ts`, and `convex/lib/verification.ts` — already exists. These
requirements formalize, in EARS form, what the approved `design.md` in this
same directory specifies across its seven hardening surfaces, its seven
Correctness Properties (P1–P7), and its ten Low-Level Design sections (LLD-1
through LLD-10).

The requirements below are **derived from design**, not proposed independently.
Every acceptance criterion below traces to a specific design section
(`design.md § …`) so a reviewer can verify one against the other.

Every AGENTS.md invariant — the 60-second SLA, reaper TTL, hazard lexicon,
NSFW/violence 0.50 cutoff, no human image-review queue, legal-escalation stub,
`priority_tier` server-ownership, and the closed list of approved third-party
dependencies — is a **hard non-goal** here (Requirement 12).

## Glossary

- **CampusCore_Deployment**: One per-school unit consisting of one Convex
  project, one Vercel project, one Clerk instance, and one Telegram bot, all
  serving exactly one school. Set by `CAMPUSCORE_SCHOOL_CODE`.
- **Registry**: The readonly array `SCHOOL_REGISTRY` exported from
  `config/schoolRegistry.ts`, plus its lookup helpers (`findSchoolByCode`,
  `acceptedDomainsForSchool`).
- **Registry_Entry**: A single `SchoolEntry` value in the Registry, with
  fields `code`, `name`, `category`, `studentDomains`, `staffDomains`, and
  the optional `shortName` and `verified` additive fields defined in
  design.md § Component 1.
- **Active_School_Resolver**: The module `config/school.ts`, which resolves
  `CAMPUSCORE_SCHOOL_CODE` to a Registry_Entry and exports the email
  predicates `isSchoolMemberEmail`, `isStaffEmail`, `isAdminEmail`, and
  `getAdminAllowlist`.
- **Admin_Predicate**: The `isAdminEmail` function exported by
  Active_School_Resolver.
- **Member_Predicate**: The `isSchoolMemberEmail` function exported by
  Active_School_Resolver.
- **Admin_Allowlist**: The parsed list produced by `getAdminAllowlist()`,
  sourced from the `CAMPUSCORE_ADMIN_ALLOWLIST` environment variable.
- **Pairing_Service**: The Convex module `convex/pairing.ts`, which exports
  `createPairingToken` and `redeemPairingToken`.
- **Pairing_Token**: The opaque string minted by `createPairingToken` and
  redeemed by `redeemPairingToken`.
- **PAIRING_TTL_MS**: 180000 (three minutes), the pairing token time-to-live
  as defined in `convex/pairing.ts`.
- **REVERIFY_TTL_MS**: 2592000000 (thirty days), the re-verification window
  as defined in `convex/lib/verification.ts`.
- **Verification_Gate**: The `checkVerification` function in
  `convex/lib/verification.ts`, called by Telegram ingestion paths before
  any ticket write.
- **Middleware**: The Next.js edge middleware in `middleware.ts` that
  enforces Layer 2 domain and admin-allowlist checks on `/admin/*`,
  `/api/admin/*`, `/volunteer/*`, and `/api/resolve/*` routes.
- **Clerk_Instance**: The per-deployment Clerk application whose
  dashboard-level allowed-sign-up domains are Layer 1 of the two-layer
  domain restriction described in design.md § Auth Model.
- **Fork_Runbook**: The documentation deliverable specified in design.md
  § LLD-7 that walks a stranger engineer at any Registry school through
  one-time setup and ongoing maintenance.
- **Registry_Evolution_Process**: The documentation deliverable specified
  in design.md § LLD-8 for adding schools, updating schools, and refusing
  runtime overrides.
- **Admin_Lifecycle_Process**: The documentation deliverable specified in
  design.md § LLD-9 for admin onboarding, rotation, and revocation via
  environment variables plus redeploy.
- **Webhook_Rotation_Process**: The documentation deliverable specified in
  design.md § LLD-6 for rotating `TELEGRAM_WEBHOOK_SECRET` without update
  loss.
- **Registry_Static_Test**: The Vitest test defined in design.md § LLD-1
  Step 3 that enforces uniqueness and domain-shape invariants at CI time.
- **REGISTRY_SCHEMA_VERSION**: The exported constant defined in design.md
  § LLD-1 Step 4 that pins the `SchoolEntry` shape for downstream forks.
- **AGENTS_Invariants**: The set of hard non-goals listed in `AGENTS.md`
  § "Approval Checkpoints" and § "Access & Permission Boundaries",
  restated in Requirement 12.

## Requirements

### Requirement 1: Registry Accuracy and Shape

**User Story:** As an engineer forking CampusCore for my institution, I want
the school Registry to be a trustworthy catalogue with enforced structural
invariants, so that a one-line `CAMPUSCORE_SCHOOL_CODE` change is a safe
deployment step rather than a source of subtle domain-check bugs.

Traces to design.md § Registry Contract, § Component 1, § LLD-1.

#### Acceptance Criteria

1. FOR ALL pairs of Registry_Entry values A and B in the Registry where A is
   not the same entry as B, THE Registry_Static_Test SHALL assert that
   A.code is not equal to B.code (Property P6).
2. FOR ALL Registry_Entry values E in the Registry, THE Registry_Static_Test
   SHALL assert that every string in E.studentDomains and E.staffDomains is
   non-empty, is equal to its own lowercased form, and contains no `@`
   character.
3. THE Registry SHALL support the additive optional fields `shortName` and
   `verified` on Registry_Entry as specified in design.md § Component 1,
   without breaking the existing required fields (`code`, `name`,
   `category`, `studentDomains`, `staffDomains`).
4. WHERE a Registry_Entry has a populated `verified` field, THE
   Registry_Entry SHALL contain `verified.at` as a Unix millisecond
   timestamp, `verified.by` as a reviewer handle string, and
   `verified.source` as a source URL or IT-portal reference string.
5. IF a Registry_Entry has neither a populated `verified` field nor a
   `// verify` source-comment within the file, THEN THE Registry_Static_Test
   SHALL fail the build.
6. THE Registry SHALL retain each of the eight Registry_Entry values
   currently marked `// verify` in `config/schoolRegistry.ts` — `sit`,
   `suss`, `np`, `sp`, `tp`, `nyp`, `rp`, and `ite` — until each entry's
   `studentDomains` value is independently confirmed against that school's
   published IT documentation and the `// verify` comment is removed in the
   same pull request that adds a populated `verified` field. **Operator
   note:** independent confirmation of each school's canonical student
   subdomain requires access to that school's IT portal or a current
   student account and cannot be performed by an autonomous agent; this
   criterion is expected to gate on WAITING_ON_HUMAN entries, one per
   listed school code.
7. THE Registry module SHALL export a constant named
   `REGISTRY_SCHEMA_VERSION` whose value is bumped only when a required
   field of `SchoolEntry` is removed, renamed, or has its meaning changed,
   and is not bumped for additive changes such as new optional fields or
   new entries (design.md § LLD-1 Step 4).
8. THE Registry SHALL be exported as a `readonly` array such that no
   runtime code path can mutate its contents.

### Requirement 2: Email Predicate Audit

**User Story:** As a security reviewer, I want every email-predicate call in
Active_School_Resolver to normalize its input consistently and to have a
documented behavior on malformed input, so that a whitespace, case, or
malformed-shape edge case cannot cause a member or admin check to disagree
between the middleware and the Convex mutations that both call the same
predicates.

Traces to design.md § Component 2, § LLD-2, Property P5.

#### Acceptance Criteria

1. FOR ALL email strings E and all case transformations σ applied only to
   the local-part (the substring before the last `@`) of E, THE
   Member_Predicate SHALL return the same boolean value for E and for σ(E)
   (Property P5).
2. WHEN Active_School_Resolver extracts the domain portion of an input
   email string, THE Active_School_Resolver SHALL trim leading and trailing
   whitespace from the input before slicing at the last `@` and before
   lowercasing (design.md § LLD-2 aggregate fix list, item 1).
3. IF the input to any predicate exported by Active_School_Resolver is an
   empty string, THEN THE predicate SHALL return `false`.
4. IF the input to any predicate exported by Active_School_Resolver
   contains no `@` character after trimming, THEN THE predicate SHALL
   return `false`.
5. WHEN `emailDomain` receives an email containing multiple `@` characters,
   THE Active_School_Resolver SHALL interpret the substring after the last
   `@` as the domain, consistent with the RFC-permitted quoted local-part
   interpretation and with Clerk's parser (design.md § LLD-2 table row 1).
6. THE Active_School_Resolver SHALL NOT normalize the local-part of an
   allowlist entry differently from the local-part of an inbound email;
   both SHALL pass through the same trim-then-lowercase pipeline
   (design.md § LLD-2 aggregate fix list, item 3).

### Requirement 3: Admin Auth Model — Fail-Closed

**User Story:** As the operator of a school deployment, I want the admin
gate to fail closed on every misconfiguration path, so that an empty
allowlist, a missing env var, or a staff-domain-only account never yields
admin access, and so that layer 2 of the two-layer domain restriction
holds even when layer 1 (Clerk dashboard) drifts.

Traces to design.md § Auth Model, § Algorithm `isAdminEmail`, § LLD-4,
§ Error Scenarios 1 and 6, Properties P1 and P4.

#### Acceptance Criteria

1. FOR ALL email strings E, WHILE the environment variable
   `CAMPUSCORE_ADMIN_ALLOWLIST` is unset, empty, or consists only of
   whitespace and separator characters, THE Admin_Predicate SHALL return
   `false` (Property P1).
2. FOR ALL email strings E where the Admin_Predicate returns `true`, THE
   domain portion of E (as extracted by `emailDomain`) SHALL be a member
   of `getActiveSchool().staffDomains` (Property P4).
3. WHEN `getAdminAllowlist` parses `CAMPUSCORE_ADMIN_ALLOWLIST`, THE
   Active_School_Resolver SHALL split on the regular-expression class
   `[\s,]+` (matching any run of whitespace or commas), trim each token,
   lowercase each token, and drop empty tokens (design.md § LLD-4).
4. WHEN `getAdminAllowlist` parses `CAMPUSCORE_ADMIN_ALLOWLIST`, THE
   Active_School_Resolver SHALL preserve duplicate tokens in the returned
   array without deduplication (design.md § LLD-4 documented behavior;
   `Array.includes` is duplicate-tolerant at the check site).
5. IF a token in `CAMPUSCORE_ADMIN_ALLOWLIST` contains no `@` character
   after trimming, THEN THE Active_School_Resolver SHALL retain the token
   in the returned array; and THE Admin_Predicate SHALL never match such a
   token against a well-formed JWT email (design.md § LLD-4 documented
   behavior — malformed entries are dead entries).
6. THE Admin_Predicate SHALL require both a staff-domain match AND
   membership in the Admin_Allowlist; membership in the Admin_Allowlist
   alone (with a non-staff domain) SHALL NOT grant admin
   (design.md § Auth Model, algorithm `isAdminEmail`).
7. WHEN a request targets an admin route matched by
   `createRouteMatcher(["/admin(.*)", "/api/admin(.*)"])`, THE Middleware
   SHALL invoke the Admin_Predicate against the lowercased email claim of
   the verified JWT and SHALL respond with HTTP 403 on a `false` result
   (design.md § Component 4).
8. WHEN a request targets a member route matched by
   `createRouteMatcher(["/volunteer(.*)", "/api/resolve(.*)"])`, THE
   Middleware SHALL invoke the Member_Predicate against the lowercased
   email claim of the verified JWT and SHALL respond with HTTP 403 on a
   `false` result.

### Requirement 4: 30-Day Re-Verification Gate

**User Story:** As a Convex ingestion handler, I want the 30-day re-
verification gate to have exactly three externally observable states
(never-paired, fresh, stale) with a precise boundary condition, so that a
stale user's Telegram messages never produce ticket writes and re-pairing
is the single code path that refreshes verification.

Traces to design.md § Algorithm `checkVerification`, § LLD-5, Property P7.

#### Acceptance Criteria

1. FOR ALL paired users U and all times t1 and t3 where t3 is the time of
   the next successful `redeemPairingToken` call binding U's
   `clerk_user_id` and where the condition
   `t1 − U.last_verified_at > REVERIFY_TTL_MS` holds, FOR ALL times t2 in
   the half-open interval `[t1, t3)`, `checkVerification(t2)` SHALL return
   `{ verified: false, reason: "stale" }`; AND `checkVerification(t3 + ε)`
   for arbitrarily small positive ε SHALL return
   `{ verified: true, clerk_user_id: U.clerk_user_id }` (Property P7).
2. WHEN no `users` row exists whose `telegram_user_id` matches the input,
   THE Verification_Gate SHALL return
   `{ verified: false, reason: "not_paired" }`.
3. WHEN a `users` row exists whose `telegram_user_id` matches the input
   and the expression `Date.now() - user.last_verified_at` is less than or
   equal to `REVERIFY_TTL_MS`, THE Verification_Gate SHALL return
   `{ verified: true, clerk_user_id: user.clerk_user_id }`.
4. WHEN a `users` row exists whose `telegram_user_id` matches the input
   and the expression `Date.now() - user.last_verified_at` is greater than
   `REVERIFY_TTL_MS`, THE Verification_Gate SHALL return
   `{ verified: false, reason: "stale" }`.
5. THE Verification_Gate SHALL treat the boundary condition
   `Date.now() - user.last_verified_at === REVERIFY_TTL_MS` as fresh
   (strict `>` comparison, not `>=`; design.md § LLD-5 boundary conditions).
6. THE Verification_Gate SHALL perform no database mutation; it SHALL be
   a read-only query with respect to the `users` table.
7. THE `users.last_verified_at` field SHALL be refreshed only by a
   successful `redeemPairingToken` mutation; no other code path — in
   particular no plain Clerk sign-in on the Next.js dashboard — SHALL
   update `last_verified_at` (design.md § LLD-5 design decision).
8. WHEN the Verification_Gate returns
   `{ verified: false, reason: "not_paired" }` or
   `{ verified: false, reason: "stale" }`, THE Convex ingestion path SHALL
   NOT create a ticket for that message (design.md § LLD-5 boundary
   condition "Mid-Telegram-session staleness").

### Requirement 5: Pairing Token Security

**User Story:** As a security reviewer, I want the Telegram deep-link
pairing token to have a cryptographically-random source with a documented
entropy floor, a bounded time-to-live, and provably-atomic single-use
redemption, so that a leaked, replayed, or stale token cannot be redeemed
even under concurrent webhook delivery.

Traces to design.md § Algorithms `createPairingToken` and
`redeemPairingToken`, § Component 3, § LLD-3, § Error Scenario 5,
§ Security Considerations, Properties P2 and P3.

#### Acceptance Criteria

1. FOR ALL Pairing_Token values T and all finite sequences of
   `redeemPairingToken(T, *)` calls issued in any order, the cardinality
   of the set of calls that return `{ ok: true, clerk_user_id: … }` SHALL
   be at most one (Property P2).
2. FOR ALL Pairing_Token values T minted at time t0 and all times t
   satisfying `t > t0 + PAIRING_TTL_MS`, `redeemPairingToken(T, *)` at
   time t SHALL return `{ ok: false, reason: "expired" }` (Property P3).
3. THE Pairing_Service SHALL source token bytes from the Web Crypto API
   (`crypto.getRandomValues` or `crypto.randomUUID`) and SHALL NOT source
   token bytes from `Math.random` or any non-CSPRNG generator
   (design.md § Security Considerations, § LLD-3).
4. THE Pairing_Service SHALL produce tokens with at least 128 bits of
   effective entropy; the current implementation using
   `crypto.randomUUID().replace(/-/g, "")` (yielding 122 bits from a v4
   UUID) is accepted with a code comment documenting the entropy floor,
   and the preferred form
   `hexEncode(crypto.getRandomValues(new Uint8Array(16)))` yielding a
   clean 128 bits is also acceptable (design.md § LLD-3).
5. WHEN `createPairingToken` is invoked, THE Pairing_Service SHALL insert
   a `pairings` row with `status = "pending"`, `redeemed_at = null`,
   `telegram_user_id = null`, and
   `expires_at = created_at + PAIRING_TTL_MS`.
6. IF `redeemPairingToken` is called with a token string that has no
   matching row in the `pairings` table, THEN THE Pairing_Service SHALL
   return `{ ok: false, reason: "invalid" }`.
7. IF `redeemPairingToken` is called with a token whose row has a
   non-null `redeemed_at`, THEN THE Pairing_Service SHALL return
   `{ ok: false, reason: "already_redeemed" }`.
8. WHEN `redeemPairingToken` succeeds, THE Pairing_Service SHALL patch
   the `pairings` row with `redeemed_at = Date.now()`,
   `telegram_user_id = <caller-supplied>`, and `status = "redeemed"`; AND
   THE Pairing_Service SHALL upsert the corresponding `users` row keyed
   on `clerk_user_id` with `last_verified_at = Date.now()` (Requirement
   4.7 refresh path).
9. WHEN `createPairingToken` is invoked without a Clerk-authenticated
   identity, OR when the caller's email fails `isSchoolMemberEmail`, THE
   Pairing_Service SHALL throw an error and SHALL NOT insert a `pairings`
   row (design.md § Algorithm `createPairingToken`, preconditions).
10. THE Pairing_Service SHALL rely on Convex's serializable mutation
    semantics for single-use redemption and SHALL NOT introduce a unique
    index on `pairings.token`, retry-on-collision logic, or any other
    mechanism whose failure mode differs from the design's
    `.unique()` + patch pattern (design.md § Error Scenario 5).

### Requirement 6: Admin Auth Lifecycle

**User Story:** As a school operator, I want a documented onboard,
rotate, and revoke procedure for admins that uses only the deployment
platform's environment-variable surface and requires no schema migration,
so that admin changes are auditable, have no self-service escalation
surface, and can be performed by any operator with Vercel and Convex
dashboard access.

Traces to design.md § LLD-9.

#### Acceptance Criteria

1. THE Admin_Lifecycle_Process SHALL document that adding an admin
   consists of appending the target email to
   `CAMPUSCORE_ADMIN_ALLOWLIST` in both the Vercel environment and the
   Convex environment and then redeploying, with no schema migration and
   no runtime mutation.
2. THE Admin_Lifecycle_Process SHALL document that rotating or revoking
   an admin consists of removing the target email from
   `CAMPUSCORE_ADMIN_ALLOWLIST` in both environments and redeploying,
   and SHALL state that the revoked email's next request to any
   `/admin/*` route returns HTTP 403 on the following request cycle
   (design.md § LLD-9 "Rotation").
3. THE Admin_Lifecycle_Process SHALL state that no `admins` table, no
   runtime `_admin_grants` table, and no superadmin distinction exist in
   this spec; all entries in `CAMPUSCORE_ADMIN_ALLOWLIST` are peers
   (design.md § LLD-9 "Superadmin distinction: none").
4. THE Admin_Lifecycle_Process SHALL document the three properties the
   env-var model preserves (auditability via env-history, no self-service
   escalation surface, fail-closed simplicity) so that future
   contributors have a written cost/benefit before proposing a
   database-backed admin model.
5. THE `CAMPUSCORE_ADMIN_ALLOWLIST` variable SHALL be set identically in
   both the Next.js runtime environment and the Convex runtime
   environment because those runtimes have separate `process.env`
   (design.md § Environment variable contract).

### Requirement 7: Registry Evolution Process

**User Story:** As a maintainer of the shared upstream repository, I want
a written process for adding a school, updating a school's domains, and
refusing runtime overrides of the Registry, so that the Registry remains
the trust anchor for the two-layer domain restriction and cannot be
bypassed by any deploy-time configuration.

Traces to design.md § LLD-8, § Error Scenario 4.

#### Acceptance Criteria

1. WHEN a developer at a new school proposes adding that school to the
   Registry, THE Registry_Evolution_Process SHALL require a pull request
   against the upstream repository that adds a Registry_Entry with a
   populated `verified` block containing source URLs and reviewer, and
   SHALL require the Registry_Static_Test to pass before merge.
2. WHEN an existing school's canonical student or staff domain changes,
   THE Registry_Evolution_Process SHALL require a pull request that adds
   the new domain to the appropriate array and retains the previous
   domain for a documented grace period marked by a source-code comment,
   until the school explicitly retires the previous domain
   (design.md § Error Scenario 4, § LLD-8 "Updating an existing school").
3. THE Registry_Evolution_Process SHALL forbid a runtime override
   mechanism (there SHALL be no environment variable or configuration
   file that patches Registry contents at deploy time); a school with an
   urgent change ahead of an upstream merge SHALL patch the file in its
   own fork (design.md § LLD-8 "Runtime override: none").
4. THE Registry_Evolution_Process SHALL document that downstream
   deployments receive new Registry entries only via periodic upstream
   pull, and use an entry only if `CAMPUSCORE_SCHOOL_CODE` matches its
   `code`.
5. THE Registry_Evolution_Process SHALL defer the open question of MOE
   school code granularity — whether a specific JC or secondary school
   sharing the `students.edu.sg` domain warrants a per-school
   Registry_Entry distinguished by a school-owned identifier — to a
   future spec, and SHALL NOT resolve that question in this hardening
   pass (design.md § Open Questions item 5).

### Requirement 8: Fork-and-Adopt Runbook

**User Story:** As an in-house engineer at any school listed in the
Registry, I want a written runbook that walks me through one-time
CampusCore setup and ongoing maintenance, so that I can deploy without
reverse-engineering the codebase and can hand the runbook to my successor.

Traces to design.md § LLD-7.

#### Acceptance Criteria

1. THE Fork_Runbook SHALL enumerate the school-administrator approvals
   required before engineering begins: authorization to create third-
   party service accounts (Clerk, Convex, Vercel, Telegram, Resend,
   Groq); confirmation of the school's canonical student and staff email
   domains against the Registry; a list of 2 to 5 initial admin staff
   emails for `CAMPUSCORE_ADMIN_ALLOWLIST`; and the deployment domain
   choice (school-owned subdomain or Vercel-provided `*.vercel.app`).
2. THE Fork_Runbook SHALL document the seven one-time engineering setup
   steps: (a) fork the repo; (b) verify or add the school's
   Registry_Entry; (c) create a Clerk_Instance with Google OAuth, dashboard
   domain restrictions equal to `studentDomains ∪ staffDomains`, and a
   JWT template named `convex`; (d) create a Convex project and set every
   Convex-side environment variable; (e) create a Telegram bot with a
   webhook secret and register the webhook against the Convex deployment;
   (f) create a Vercel project linked to the fork with every Vercel-side
   environment variable set; (g) run the four end-to-end verifications
   (student sign-in, pairing round-trip, admin sign-in, non-admin 403).
3. THE Fork_Runbook SHALL document the ongoing per-school maintenance
   activities: annual `TELEGRAM_WEBHOOK_SECRET` rotation
   (see Requirement 9); Telegram bot token rotation when a bot admin
   leaves; admin changes via `CAMPUSCORE_ADMIN_ALLOWLIST` edit plus
   redeploy (see Requirement 6); periodic upstream pull for security
   fixes and Registry updates.
4. THE Fork_Runbook SHALL document that layer 1 of the two-layer domain
   restriction (Clerk dashboard allowed-sign-up domains) is authoritative
   and layer 2 (Middleware) is defense-in-depth, and SHALL state that
   both layers must be configured because either alone is insufficient
   (design.md § Auth Model, § Security Considerations, § Error Scenario 6).
5. THE Fork_Runbook SHALL enumerate every environment variable listed in
   design.md § Environment variable contract with its runtime (Next.js,
   Convex, or both), whether it is required, and whether it is sensitive.

### Requirement 9: Telegram Webhook Secret Rotation

**User Story:** As an operator rotating `TELEGRAM_WEBHOOK_SECRET`, I want
a written procedure that preserves update delivery without introducing a
dual-secret code path, so that a rotation event does not silently lose
Telegram updates and does not require a change to the single-secret
verification code.

Traces to design.md § LLD-6, § Security Considerations.

#### Acceptance Criteria

1. THE Webhook_Rotation_Process SHALL document the single-secret rotation
   sequence: (a) generate a new secret `S_new`; (b) call Telegram Bot
   API `setWebhook` with the same URL and `secret_token: S_new`;
   (c) update the Convex environment via `npx convex env set
   TELEGRAM_WEBHOOK_SECRET S_new`; (d) redeploy Convex; (e) verify with
   a test message.
2. THE Webhook_Rotation_Process SHALL document that during the brief
   propagation window between Convex env set and Convex hot-reload,
   updates presenting `S_new` may be temporarily rejected, and SHALL
   state that Telegram retries with exponential backoff make this window
   safe (no data loss).
3. THE Webhook_Rotation_Process SHALL document the dual-secret variant
   (accepting a comma-separated `TELEGRAM_WEBHOOK_SECRETS` env and
   checking presented header against any listed value) as an explicit
   deferred follow-up, and SHALL state that the single-secret variant is
   acceptable for this spec (design.md § LLD-6 "future refinement").
4. IF the presented `X-Telegram-Bot-Api-Secret-Token` header does not
   equal the current `TELEGRAM_WEBHOOK_SECRET` env value, THEN THE
   Convex Telegram webhook handler SHALL reject the update.

### Requirement 10: Data Isolation Boundary

**User Story:** As a compliance-aware maintainer, I want the one-Convex-
project-per-school tenancy boundary to be an explicit, documented
invariant of this spec, so that a future contributor proposing to
reintroduce a `school_id` column must produce a written cost/benefit
rather than doing so silently.

Traces to design.md § Deployment Topology, § Data Models, § LLD-10.

#### Acceptance Criteria

1. THE CampusCore_Deployment SHALL be a self-contained tenancy unit
   consisting of exactly one Convex project, exactly one Vercel project,
   exactly one Clerk_Instance, and exactly one Telegram bot, all serving
   exactly one school selected by `CAMPUSCORE_SCHOOL_CODE`.
2. THE `convex/schema.ts` schema SHALL NOT contain a `school_id` column
   on any table; cross-school data mixing SHALL be structurally
   impossible because per-school databases are separate Convex projects
   (design.md § Data Models).
3. THE CampusCore_System SHALL NOT operate a shared Convex deployment
   that serves multiple schools; any proposal to reintroduce a
   `school_id` column SHALL require a separate spec that addresses the
   four risks enumerated in design.md § LLD-10: cross-tenant leak blast
   radius, quota accounting, delete-my-school-cleanly, and PDPA
   compliance separation.
4. THE Registry Contract, the Admin_Predicate, and the Member_Predicate
   SHALL all read from the single active school selected by
   `CAMPUSCORE_SCHOOL_CODE`; no runtime code path SHALL enumerate
   entries for more than one school in a single request.

### Requirement 11: Test Tooling and Dependencies

**User Story:** As an AGENTS.md approval-checkpoint reviewer, I want a
single auditable record of every third-party dependency this spec adds
or does not add, so that the AGENTS.md "no new deps beyond the current
stack" invariant is upheld and any exceptions are explicitly signed off.

Traces to design.md § Dependencies, § Testing Strategy, § Open Questions
item 1. Corresponds to the AGENTS.md § "Approval Checkpoints" invariant
requiring human sign-off before any new third-party dependency.

#### Acceptance Criteria

1. THE spec SHALL add exactly one new dependency to the project's
   `package.json`: `fast-check`, added under `devDependencies` only,
   for the property-based tests specified in design.md § Testing
   Strategy for Properties P1 through P7.
2. THE `fast-check` dependency SHALL be recorded in this requirements
   document as having been explicitly approved by the repository owner
   as an AGENTS.md § "Approval Checkpoints" exception; the approval is
   recorded here for auditability and SHALL be re-affirmed in the pull
   request that adds the dependency.
3. THE spec SHALL NOT introduce any dependency other than `fast-check`;
   in particular THE spec SHALL NOT introduce `tfjs-node`, any native-
   binary ML runtime, any new email provider, any new database driver,
   or any package outside the AGENTS.md-approved stack of Convex, Clerk,
   Next.js/Vercel, Telegram Bot API, Cloudflare, ONNX Runtime WASM, and
   Resend (design.md § Non-Goals, AGENTS.md § "Approval Checkpoints").
4. THE property-based tests SHALL use `fast-check` and SHALL be
   configured with at least 100 iterations per property test as
   specified in the workflow's property-test configuration guidance.
5. THE `fast-check` dependency SHALL be pinned to an exact version in
   `package.json` (no `^` or `~` range) to preserve reproducible
   property-test runs across contributor machines.

### Requirement 12: Scope Guard — AGENTS.md Invariants

**User Story:** As the repository owner enforcing AGENTS.md, I want this
spec's non-goals to be stated as explicit acceptance criteria, so that a
reviewer can verify at merge time that the hardening pass has not
silently weakened any life-safety-path invariant.

Traces to design.md § Non-Goals and Out-of-Scope, AGENTS.md § "Approval
Checkpoints" and § "Access & Permission Boundaries".

#### Acceptance Criteria

1. THE CampusCore_System SHALL retain the 60-second emergency SLA
   threshold unchanged by this spec.
2. THE CampusCore_System SHALL retain the reaper TTL and `retry_count`
   dead-letter threshold unchanged by this spec.
3. THE CampusCore_System SHALL retain the hazard lexicon word list
   unchanged by this spec.
4. THE CampusCore_System SHALL retain the NSFW and violence confidence
   cutoff at 0.50 unchanged by this spec.
5. THE CampusCore_System SHALL NOT introduce a human image-review
   queue, a `pending_review` ticket state, or any user interface for a
   person to view a flagged image.
6. THE `/api/legal-escalation` endpoint SHALL remain a stub that logs
   the payload; this spec SHALL NOT wire the endpoint to a real email
   address, webhook, or ticketing system.
7. THE `priority_tier` column on tickets SHALL remain server-owned
   exclusively by the ingestion-time lexicon check; no client-facing
   mutation added or modified by this spec SHALL be able to set or
   change `priority_tier`.
8. THE Admin_Predicate SHALL retain its fail-closed behavior as
   specified in Requirement 3.1; no code path added by this spec SHALL
   grant admin on a staff-domain match alone.
9. THE Pairing_Service SHALL retain its single-redemption invariant as
   specified in Requirement 5.1; no code path added by this spec SHALL
   permit a token to be redeemed more than once.
10. THE Verification_Gate SHALL retain the 30-day re-verification window
    as specified in Requirement 4; no code path added by this spec SHALL
    bypass, extend, or shorten `REVERIFY_TTL_MS`.
11. THE account-selling residual risk documented in AGENTS.md § "Known
    Limitations" SHALL be preserved as an accepted trade-off; this spec
    SHALL NOT add device fingerprinting, biometric checks, or any other
    mechanism whose purpose is to defeat a verified student
    re-authenticating on a buyer's behalf.
