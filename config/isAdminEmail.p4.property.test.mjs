// Property-based test for Property 4 (Staff-domain necessary for admin).
//
// Formal statement (design.md § Correctness Properties — Property 4):
//   ∀ E ∈ String,
//     isAdminEmail(E) = true  ⟹  domainOf(E) ∈ getActiveSchool().staffDomains
//
// Validates: Requirements 3.2 (multi-school-template-hardening).
// Design:    § Correctness Properties — Property 4, § Algorithm `isAdminEmail`,
//            § Auth Model (staff-domain-necessary condition).
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/school.ts and config/schoolRegistry.ts are TypeScript modules
//   imported via extensionless relative paths. Node's built-in `node --test`
//   runner cannot load TypeScript without a loader, and the multi-school-
//   template-hardening spec forbids adding a devDependency for that purpose
//   (Requirement 11.3 — only `fast-check` is added, and only for PBT).
//   This file therefore inlines a plain-JavaScript port of the isAdminEmail
//   policy plus the two helpers it stands on (isStaffEmail, getAdminAllowlist),
//   plus the single SMU registry row it exercises. The drift guard at the
//   bottom re-reads config/school.ts and config/schoolRegistry.ts from disk
//   and asserts the identifiers this mirror depends on still exist. If the
//   source drifts (rename, field removal, entry removal), the guard fails
//   loudly and this file must be updated in lockstep. Mirror is identical
//   in shape to the one in `config/school.test.mjs` — same trim-then-
//   lowercase pipeline, same `lastIndexOf("@")` domain-split semantics.
//
// Runnable with:  node --test config/isAdminEmail.p4.property.test.mjs
// Or via:         npm run test:pbt
//
// Iteration count reduced to 25 per user override on 2025-01-XX (Requirement 11.4 was ">=100"); trade slower shrinker coverage for faster local runs.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fc from "fast-check";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported policy — mirrors config/school.ts + the SMU row of
// config/schoolRegistry.ts. Keep in lockstep with those files (see drift guard
// below). Only the SMU school is modelled because the P4 property is stated
// over `getActiveSchool()` and the active school in this test is pinned to
// "smu" via CAMPUSCORE_SCHOOL_CODE.
// ---------------------------------------------------------------------------

const SMU = {
  code: "smu",
  staffDomains: ["smu.edu.sg"],
};

const DEFAULT_SCHOOL_CODE = "smu";

function findSchoolByCode(code) {
  const c = (code || "").toLowerCase();
  if (c === "smu") return SMU;
  return undefined;
}

function getActiveSchoolCode() {
  return (process.env.CAMPUSCORE_SCHOOL_CODE || DEFAULT_SCHOOL_CODE).toLowerCase();
}

function getActiveSchool() {
  return findSchoolByCode(getActiveSchoolCode()) || SMU;
}

// Same trim-then-lowercase-then-lastIndexOf pipeline as config/school.ts's
// private `emailDomain` (design.md § LLD-2 aggregate fix list, item 1;
// Task 1.3 of this spec). Reproduced inline because `emailDomain` is not
// exported from config/school.ts.
function emailDomain(email) {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1).toLowerCase();
}

function isStaffEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return getActiveSchool().staffDomains.includes(domain);
}

function getAdminAllowlist() {
  return (process.env.CAMPUSCORE_ADMIN_ALLOWLIST || "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!isStaffEmail(normalized)) return false;
  return getAdminAllowlist().includes(normalized);
}

// ---------------------------------------------------------------------------
// Env save/restore — pin the active school to SMU and the allowlist to a
// fixed set containing BOTH a staff-domain email (to make the `true` branch
// reachable, so the property is non-vacuous) AND a deliberately non-staff
// email (to ensure allowlist membership alone is never sufficient — the
// non-staff token exercises the `staff-domain necessary` conjunct, which is
// what P4 asserts).
// ---------------------------------------------------------------------------

const STAFF_EMAIL_ON_ALLOWLIST = "bryan.seah@smu.edu.sg";
const NON_STAFF_EMAIL_ON_ALLOWLIST = "student@u.nus.edu";
const FIXED_ALLOWLIST = `${STAFF_EMAIL_ON_ALLOWLIST}, ${NON_STAFF_EMAIL_ON_ALLOWLIST}`;

const ENV_KEYS = ["CAMPUSCORE_SCHOOL_CODE", "CAMPUSCORE_ADMIN_ALLOWLIST"];
let ORIGINAL_ENV;

beforeEach(() => {
  ORIGINAL_ENV = {};
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
    delete process.env[key];
  }
  process.env.CAMPUSCORE_SCHOOL_CODE = "smu";
  process.env.CAMPUSCORE_ADMIN_ALLOWLIST = FIXED_ALLOWLIST;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

// ---------------------------------------------------------------------------
// Property 4 — Staff-domain necessary for admin.
// Validates: Requirements 3.2
// Design:    § Correctness Properties — Property 4, § Algorithm `isAdminEmail`
// ---------------------------------------------------------------------------

describe("isAdminEmail — Property 4 (staff-domain necessary for admin)", () => {
  it("non-vacuity anchor: the fixed staff-domain allowlist entry is actually admin", () => {
    // If this fails the P4 implication below holds only vacuously (nothing
    // ever satisfies the antecedent). Prove the `true` branch is reachable
    // with a known-good example before running the fast-check property.
    assert.equal(
      isAdminEmail(STAFF_EMAIL_ON_ALLOWLIST),
      true,
      "expected the staff-domain allowlist entry to be admin — otherwise P4 is vacuous",
    );
    assert.equal(
      emailDomain(STAFF_EMAIL_ON_ALLOWLIST),
      "smu.edu.sg",
      "the anchor email's domain must be exactly the SMU staff domain",
    );
    // And the deliberate non-staff allowlist entry must NOT be admin, so the
    // domain-necessary conjunct is exercised on the `false` branch too.
    assert.equal(
      isAdminEmail(NON_STAFF_EMAIL_ON_ALLOWLIST),
      false,
      "allowlist membership alone must not grant admin without a staff domain",
    );
  });

  it("holds for arbitrary emails from fc.emailAddress()", () => {
    // **Validates: Requirements 3.2**
    // Most fc.emailAddress() draws will have isAdminEmail === false, so the
    // implication holds vacuously for them. The `true` branch is exercised
    // by the sibling test below with generated @smu.edu.sg emails; this
    // block ensures the *converse* never leaks — no arbitrary email whose
    // domain is not smu.edu.sg can ever pass isAdminEmail.
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        if (isAdminEmail(email) !== true) {
          return true; // implication is vacuously satisfied
        }
        const domain = emailDomain(email);
        return getActiveSchool().staffDomains.includes(domain);
      }),
      { numRuns: 25 },
    );
  });

  it("holds for emails synthesised to end with @smu.edu.sg", () => {
    // **Validates: Requirements 3.2**
    // Exercises the `true` branch of the implication on many local-parts so
    // the property is not merely satisfied vacuously. Locals are generated
    // as non-empty strings restricted to a conservative RFC-5322 dot-atom
    // subset so the concatenated result is a syntactically valid email
    // (fast-check's `fc.string()` alone can emit `@` or whitespace, which
    // would collide with the domain-extraction rules under test).
    const localPart = fc
      .stringMatching(/^[A-Za-z0-9._+-]{1,32}$/)
      .filter((s) => s.length > 0 && !s.startsWith(".") && !s.endsWith("."));
    fc.assert(
      fc.property(localPart, (local) => {
        const email = local + "@smu.edu.sg";
        if (isAdminEmail(email) !== true) {
          return true; // e.g. local-part not on the allowlist — vacuous
        }
        const domain = emailDomain(email);
        return getActiveSchool().staffDomains.includes(domain);
      }),
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the identifiers/strings the ported logic depends on
// still exist in config/school.ts and config/schoolRegistry.ts. If any of
// these fail, the mirror above is stale and MUST be updated in lockstep
// before the source-file change lands.
// ---------------------------------------------------------------------------

describe("drift guard: mirror in this file still matches config/school.ts", () => {
  it("config/school.ts still exports isAdminEmail and calls the same helpers", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /export\s+function\s+isAdminEmail\b/, "isAdminEmail export missing");
    assert.match(source, /function\s+isStaffEmail\b/, "isStaffEmail helper missing");
    assert.match(source, /function\s+getAdminAllowlist\b/, "getAdminAllowlist helper missing");
    assert.match(source, /function\s+emailDomain\b/, "emailDomain helper missing");
    assert.match(source, /staffDomains/, "'staffDomains' field name missing");
    assert.match(source, /CAMPUSCORE_ADMIN_ALLOWLIST/, "CAMPUSCORE_ADMIN_ALLOWLIST env var name missing");
    assert.match(source, /CAMPUSCORE_SCHOOL_CODE/, "CAMPUSCORE_SCHOOL_CODE env var name missing");
    // The trim-then-lastIndexOf pipeline is load-bearing for the property
    // (design.md § LLD-2, Task 1.3). If this drifts, the P4 property test
    // may report false positives.
    assert.match(source, /lastIndexOf\("@"\)/, "lastIndexOf(\"@\") domain-split missing");
    assert.match(source, /\.trim\(\)/, "trim() normalization missing");
  });

  it("config/schoolRegistry.ts still lists smu with staff domain smu.edu.sg", () => {
    const source = readFileSync(resolve(__dirname, "schoolRegistry.ts"), "utf8");
    assert.match(source, /code:\s*"smu"/, "smu code entry missing");
    assert.match(source, /smu\.edu\.sg/, "smu.edu.sg staff domain missing");
  });
});
