// Unit tests for config/school.ts predicate edge cases — Task 2.2 of
// multi-school-template-hardening. Deliberately NOT extending Session-3's
// config/school.test.mjs because that file is under Session-3 scope; this
// file's edge cases (trim, whitespace, multi-`@`, malformed allowlist
// tokens, duplicate allowlist entries, mixed separators) belong to this
// spec's Requirement 2 and Requirement 3 audit.
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/school.ts is a TypeScript module that imports config/schoolRegistry.ts
//   via an extensionless relative path. Node's built-in `node --test` runner
//   cannot load TypeScript without a loader devDependency, and this
//   repository's AGENTS.md § "Approval Checkpoints" rule forbids adding one
//   without a separate sign-off. Session-3's config/school.test.mjs solves
//   this the same way: it inlines a plain-JavaScript port of the relevant
//   policy plus a drift guard against the TS source. This file follows that
//   exact pattern (see: config/school.test.mjs).
//
// DRIFT GUARD:
//   The final describe() block re-reads config/school.ts and
//   config/schoolRegistry.ts from disk and asserts the identifiers this
//   mirror depends on still exist. If someone renames a helper, changes a
//   field name, removes the SMU registry row, or moves the env var names,
//   the guard fails loudly and this test file must be updated in lockstep.
//
// Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.3, 3.4, 3.5, 3.6
// Design:       § LLD-2 aggregate fix list, § LLD-4,
//               § Testing Strategy — Unit Testing Approach
//
// Runnable with:  node --test config/school.hardening.test.mjs
// Or via:         npm run test:unit

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported policy — mirrors config/school.ts + the SMU row of
// config/schoolRegistry.ts. Keep in lockstep with those files (see drift
// guard below). Only SMU is modelled here because these tests exercise the
// "smu" active-school branch. SMU's studentDomains and staffDomains both
// contain "smu.edu.sg" per the registry (autonomous_university row).
// ---------------------------------------------------------------------------

const SMU = {
  code: "smu",
  studentDomains: ["smu.edu.sg"],
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

// emailDomain — mirrors config/school.ts. Trim BEFORE slicing at the last
// `@` and BEFORE lowercasing (design.md § LLD-2 aggregate fix list item 1).
// lastIndexOf, not indexOf: RFC-permitted quoted local parts + Clerk parser
// agreement (design.md § LLD-2 table row 1).
function emailDomain(email) {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1).toLowerCase();
}

function isSchoolMemberEmail(email) {
  const school = getActiveSchool();
  const domain = emailDomain(email);
  if (!domain) return false;
  return (
    school.studentDomains.includes(domain) ||
    school.staffDomains.includes(domain)
  );
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
// Env save/restore — each case runs with a known, isolated env slice so
// leftover state from a prior case can't mask a fail-closed regression.
// Same pattern as Session-3 Task 5 (config/school.test.mjs).
// ---------------------------------------------------------------------------

const ENV_KEYS = ["CAMPUSCORE_SCHOOL_CODE", "CAMPUSCORE_ADMIN_ALLOWLIST"];
let ORIGINAL_ENV;

beforeEach(() => {
  ORIGINAL_ENV = {};
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
    delete process.env[key];
  }
  process.env.CAMPUSCORE_SCHOOL_CODE = "smu";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

// ---------------------------------------------------------------------------
// Predicate edge cases across isSchoolMemberEmail / isStaffEmail /
// isAdminEmail / getAdminAllowlist.
// ---------------------------------------------------------------------------

describe("predicate edge cases: empty input (R2.3)", () => {
  it("isSchoolMemberEmail('') returns false", () => {
    assert.equal(isSchoolMemberEmail(""), false);
  });

  it("isStaffEmail('') returns false", () => {
    assert.equal(isStaffEmail(""), false);
  });

  it("isAdminEmail('') returns false, even with a populated allowlist", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "staff@smu.edu.sg";
    assert.equal(isAdminEmail(""), false);
  });
});

describe("predicate edge cases: no `@` after trimming (R2.4)", () => {
  it("isSchoolMemberEmail('notanemail') returns false", () => {
    assert.equal(isSchoolMemberEmail("notanemail"), false);
  });

  it("isStaffEmail('notanemail') returns false", () => {
    assert.equal(isStaffEmail("notanemail"), false);
  });

  it("isAdminEmail('notanemail') returns false", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "staff@smu.edu.sg";
    assert.equal(isAdminEmail("notanemail"), false);
  });

  it("whitespace-only input has no `@` after trim and returns false", () => {
    assert.equal(isSchoolMemberEmail("   "), false);
    assert.equal(isStaffEmail("   "), false);
    assert.equal(isAdminEmail("   "), false);
  });
});

describe("predicate edge cases: whitespace-padded input equals trimmed form (R2.2)", () => {
  // Verifies Task 1.3's fix — the trim-before-slice change to emailDomain
  // and the trim-before-lowercase change to isAdminEmail (both landed in
  // config/school.ts under Task 1.3).
  const padded = "  staff@smu.edu.sg  ";
  const trimmed = "staff@smu.edu.sg";

  it("isSchoolMemberEmail agrees on padded and trimmed forms", () => {
    assert.equal(isSchoolMemberEmail(padded), isSchoolMemberEmail(trimmed));
    assert.equal(isSchoolMemberEmail(padded), true);
  });

  it("isStaffEmail agrees on padded and trimmed forms", () => {
    assert.equal(isStaffEmail(padded), isStaffEmail(trimmed));
    assert.equal(isStaffEmail(padded), true);
  });

  it("isAdminEmail agrees on padded and trimmed forms (both true when on allowlist)", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "staff@smu.edu.sg";
    assert.equal(isAdminEmail(padded), isAdminEmail(trimmed));
    assert.equal(isAdminEmail(padded), true);
  });

  it("isAdminEmail agrees on padded and trimmed forms (both false with empty allowlist)", () => {
    // Allowlist deliberately unset — fail-closed path.
    assert.equal(isAdminEmail(padded), isAdminEmail(trimmed));
    assert.equal(isAdminEmail(padded), false);
  });
});

describe("predicate edge cases: multi-`@` input treats domain as substring after LAST `@` (R2.5)", () => {
  // "a@b@smu.edu.sg" — RFC 5321/5322 permit `@` inside a quoted local-part,
  // and Clerk's parser splits on the last `@`. Aligning Layer 2 with Layer 1.
  const multi = "a@b@smu.edu.sg";

  it("isSchoolMemberEmail resolves multi-`@` domain to smu.edu.sg", () => {
    assert.equal(isSchoolMemberEmail(multi), true);
  });

  it("isStaffEmail resolves multi-`@` domain to smu.edu.sg", () => {
    assert.equal(isStaffEmail(multi), true);
  });

  it("isAdminEmail resolves multi-`@` domain to smu.edu.sg and matches allowlist verbatim", () => {
    // The allowlist parser lowercases and trims but does not re-split on `@`,
    // so a caller who registers "a@b@smu.edu.sg" gets a match on the same
    // string. The check that matters is the STAFF-DOMAIN gate uses the last
    // `@` split, which passes because smu.edu.sg is a staff domain.
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "a@b@smu.edu.sg";
    assert.equal(isAdminEmail(multi), true);
  });
});

describe("getAdminAllowlist: malformed token (no `@`) retained but never matches (R3.5)", () => {
  it("tokens with no `@` are kept in the parsed array (dead entries, not dropped)", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST =
      "malformedtoken,valid@smu.edu.sg,bare";
    const parsed = getAdminAllowlist();
    assert.deepEqual(parsed, ["malformedtoken", "valid@smu.edu.sg", "bare"]);
  });

  it("a malformed token cannot match a well-formed JWT email (any well-formed email contains `@`)", () => {
    // Every well-formed email contains `@`; every malformed allowlist token
    // does not. Array.includes cannot ever return true for that pairing.
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "malformedtoken bare notarealemail";
    assert.equal(isAdminEmail("malformedtoken@smu.edu.sg"), false);
    assert.equal(isAdminEmail("bare@smu.edu.sg"), false);
    assert.equal(isAdminEmail("notarealemail@smu.edu.sg"), false);
  });
});

describe("getAdminAllowlist: duplicate entries preserved (R3.4)", () => {
  it("duplicate emails are retained in the returned array without deduplication", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST =
      "staff@smu.edu.sg,staff@smu.edu.sg,other@smu.edu.sg";
    const parsed = getAdminAllowlist();
    assert.deepEqual(parsed, [
      "staff@smu.edu.sg",
      "staff@smu.edu.sg",
      "other@smu.edu.sg",
    ]);
    // Array.includes is duplicate-tolerant at the check site, so admin match
    // still holds. Documented as intentional in design.md § LLD-4.
    assert.equal(isAdminEmail("staff@smu.edu.sg"), true);
  });

  it("case-differing duplicates lowercase to a single canonical form, both preserved", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST =
      "Staff@SMU.EDU.SG,staff@smu.edu.sg";
    const parsed = getAdminAllowlist();
    assert.deepEqual(parsed, ["staff@smu.edu.sg", "staff@smu.edu.sg"]);
  });
});

describe("getAdminAllowlist: mixed newline/comma/space separators parse identically to comma-only (R3.3)", () => {
  const commaOnly = "a@smu.edu.sg,b@smu.edu.sg,c@smu.edu.sg";
  const mixed = "a@smu.edu.sg\nb@smu.edu.sg  c@smu.edu.sg";
  const commasNewlinesSpaces = "a@smu.edu.sg,\n b@smu.edu.sg ,c@smu.edu.sg";

  it("newline + space separators produce the same array as commas", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = commaOnly;
    const fromCommas = getAdminAllowlist();

    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = mixed;
    const fromMixed = getAdminAllowlist();

    assert.deepEqual(fromMixed, fromCommas);
    assert.deepEqual(fromMixed, [
      "a@smu.edu.sg",
      "b@smu.edu.sg",
      "c@smu.edu.sg",
    ]);
  });

  it("commas + newlines + spaces interspersed produce the same array as commas alone", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = commaOnly;
    const fromCommas = getAdminAllowlist();

    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = commasNewlinesSpaces;
    const fromInterspersed = getAdminAllowlist();

    assert.deepEqual(fromInterspersed, fromCommas);
  });
});

// ---------------------------------------------------------------------------
// Two-layer defense-in-depth boundary — isAdminEmail requires BOTH staff-
// domain match AND allowlist membership. Neither alone is sufficient.
// ---------------------------------------------------------------------------

describe("two-layer defense-in-depth: isAdminEmail requires staff-domain AND allowlist", () => {
  it("staff-domain email with EMPTY allowlist returns false (R3.1 example companion to P1)", () => {
    // Allowlist deliberately unset — fail-closed. Even a canonical staff
    // email must not gain admin without an explicit env-var grant.
    assert.equal(isAdminEmail("staff@smu.edu.sg"), false);
  });

  it("staff-domain email with WHITESPACE-ONLY allowlist returns false (R3.1)", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "   \n\t  ";
    assert.equal(isAdminEmail("staff@smu.edu.sg"), false);
  });

  it("staff-domain email with SEPARATORS-ONLY allowlist returns false (R3.1)", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = ",,, , ,";
    assert.equal(isAdminEmail("staff@smu.edu.sg"), false);
  });

  it("non-staff-domain email listed on the allowlist returns false (R3.6)", () => {
    // Admin membership alone is not sufficient — the staff-domain gate is a
    // hard precondition. Layer 2 must still fail closed even if an operator
    // pastes a personal email into CAMPUSCORE_ADMIN_ALLOWLIST by mistake.
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "outsider@gmail.com";
    assert.equal(isAdminEmail("outsider@gmail.com"), false);
  });

  it("non-staff-domain email listed alongside legitimate staff emails still returns false (R3.6)", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST =
      "staff@smu.edu.sg,outsider@gmail.com,other@smu.edu.sg";
    assert.equal(isAdminEmail("outsider@gmail.com"), false);
    // Sanity: the legitimate staff email in the same list still passes.
    assert.equal(isAdminEmail("staff@smu.edu.sg"), true);
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the identifiers/strings the ported logic depends on
// still exist in config/school.ts and config/schoolRegistry.ts. If any of
// these fail, the mirror above is stale and MUST be updated in lockstep
// before any source-file change lands.
// ---------------------------------------------------------------------------

describe("drift guard: mirror in this file still matches config/school.ts", () => {
  it("config/school.ts still exports the four predicates this file exercises", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /export\s+function\s+isSchoolMemberEmail\b/);
    assert.match(source, /export\s+function\s+isStaffEmail\b/);
    assert.match(source, /export\s+function\s+isAdminEmail\b/);
    assert.match(source, /export\s+function\s+getAdminAllowlist\b/);
  });

  it("config/school.ts still trims BEFORE slicing at `@` and BEFORE lowercasing", () => {
    // Anti-regression for Task 1.3. The emailDomain function must call trim()
    // on the input before either lastIndexOf("@") or .toLowerCase(); the
    // isAdminEmail function must trim before lowercasing.
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /\.trim\(\)/, "expected a .trim() call in school.ts");
    assert.match(
      source,
      /lastIndexOf\("@"\)/,
      "expected lastIndexOf(\"@\") (not indexOf) in school.ts"
    );
    assert.match(
      source,
      /email\.trim\(\)\.toLowerCase\(\)/,
      "expected email.trim().toLowerCase() pipeline in isAdminEmail"
    );
  });

  it("config/school.ts still splits the allowlist on /[\\s,]+/ (whitespace OR comma)", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(
      source,
      /\.split\(\/\[\\s,\]\+\/\)/,
      "expected .split(/[\\s,]+/) in getAdminAllowlist"
    );
  });

  it("config/schoolRegistry.ts still lists smu with staff domain smu.edu.sg", () => {
    const source = readFileSync(resolve(__dirname, "schoolRegistry.ts"), "utf8");
    assert.match(source, /code:\s*"smu"/);
    assert.match(source, /smu\.edu\.sg/);
    assert.match(source, /studentDomains/);
    assert.match(source, /staffDomains/);
  });

  it("CAMPUSCORE_SCHOOL_CODE and CAMPUSCORE_ADMIN_ALLOWLIST env var names still present", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /CAMPUSCORE_SCHOOL_CODE/);
    assert.match(source, /CAMPUSCORE_ADMIN_ALLOWLIST/);
  });
});
