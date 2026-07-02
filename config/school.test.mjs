// Unit tests for isAdminEmail (Session 3, Property 2 — fail-closed admin gate).
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   config/school.ts and config/schoolRegistry.ts are TypeScript modules that
//   import each other via extensionless relative paths. Node's built-in
//   `node --test` runner cannot load TypeScript without a loader, and the
//   Session-3 task list forbids adding any new devDependency (AGENTS.md rule:
//   no new third-party dependency without a separate approval). This file
//   therefore inlines a plain-JavaScript port of the isAdminEmail policy and
//   the two helpers it stands on (isStaffEmail, getAdminAllowlist), plus the
//   single SMU registry row it exercises.
//
// DRIFT GUARD:
//   The final describe() block re-reads config/school.ts and
//   config/schoolRegistry.ts from disk and asserts that the identifiers this
//   mirror depends on still exist. If someone renames isAdminEmail, changes
//   the `staffDomains` field name, removes the SMU registry entry, or moves
//   the CAMPUSCORE_ADMIN_ALLOWLIST env-var name, the guard fails loudly and
//   this test file must be updated in lockstep.
//
// Design reference: .kiro/specs/session-3-unblock-and-landing/design.md §C6,
// Property 2. Requirements: 9.1, 9.2, 9.5.
//
// Runnable with:  node --test config/school.test.mjs
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
// config/schoolRegistry.ts. Keep in lockstep with those files (see drift guard
// below). Only the SMU school is modelled here because the tests only
// exercise the "smu" active-school branch.
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

function emailDomain(email) {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
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
  const normalized = email.toLowerCase();
  if (!isStaffEmail(normalized)) return false;
  return getAdminAllowlist().includes(normalized);
}

// ---------------------------------------------------------------------------
// Env save/restore — each case runs with a known, isolated env slice so
// leftover state from a prior case can't mask a fail-closed regression.
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
// Property 2 — Admin_Gate fails closed on an empty allowlist.
// Validates: Requirements 9.1, 9.2, 9.5
// Design:    §C6, Property 2
// ---------------------------------------------------------------------------

describe("isAdminEmail (Property 2: fail-closed admin gate)", () => {
  it("returns false for empty string when allowlist is unset", () => {
    assert.equal(isAdminEmail(""), false);
  });

  it("returns false for a staff-domain email when allowlist is unset (fail-closed)", () => {
    assert.equal(isAdminEmail("bryan.seah.2024@smu.edu.sg"), false);
  });

  it("returns true for a staff-domain email that is on the allowlist", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "bryan.seah.2024@smu.edu.sg";
    assert.equal(isAdminEmail("bryan.seah.2024@smu.edu.sg"), true);
  });

  it("returns false for a non-staff-domain email even when it appears on the allowlist", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "outsider@gmail.com";
    assert.equal(isAdminEmail("outsider@gmail.com"), false);
  });

  it("is case-insensitive: mixed-case input matches a lowercase allowlist entry", () => {
    process.env.CAMPUSCORE_ADMIN_ALLOWLIST = "bryan.seah.2024@smu.edu.sg";
    assert.equal(isAdminEmail("Bryan.Seah.2024@SMU.EDU.SG"), true);
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the four identifiers/strings the ported logic depends
// on still exist in config/school.ts and config/schoolRegistry.ts. If any of
// these fail, the mirror above is stale and MUST be updated in lockstep
// before the source files change land.
// ---------------------------------------------------------------------------

describe("drift guard: mirror in this file still matches config/school.ts", () => {
  it("config/school.ts still exports isAdminEmail and calls the same helpers", () => {
    const source = readFileSync(resolve(__dirname, "school.ts"), "utf8");
    assert.match(source, /export\s+function\s+isAdminEmail\b/, "isAdminEmail export missing");
    assert.match(source, /function\s+isStaffEmail\b/, "isStaffEmail helper missing");
    assert.match(source, /function\s+getAdminAllowlist\b/, "getAdminAllowlist helper missing");
    assert.match(source, /staffDomains/, "'staffDomains' field name missing");
    assert.match(source, /CAMPUSCORE_ADMIN_ALLOWLIST/, "CAMPUSCORE_ADMIN_ALLOWLIST env var name missing");
    assert.match(source, /CAMPUSCORE_SCHOOL_CODE/, "CAMPUSCORE_SCHOOL_CODE env var name missing");
  });

  it("config/schoolRegistry.ts still lists smu with staff domain smu.edu.sg", () => {
    const source = readFileSync(resolve(__dirname, "schoolRegistry.ts"), "utf8");
    assert.match(source, /code:\s*"smu"/, "smu code entry missing");
    assert.match(source, /smu\.edu\.sg/, "smu.edu.sg staff domain missing");
  });
});
