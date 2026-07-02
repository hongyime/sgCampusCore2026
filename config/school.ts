import {
  SchoolEntry,
  findSchoolByCode,
  SCHOOL_REGISTRY,
} from "./schoolRegistry";

// Active-school resolution for a single CampusCore deployment.
//
// One deployment serves ONE school (per-school template, Session-1 decision).
// The school is chosen by the CAMPUSCORE_SCHOOL_CODE env var, set in BOTH the
// Next.js env AND the Convex env (the two runtimes don't share process.env).
//
// Stub-tolerant: if the code is unset/unknown we fall back to "smu" (the
// documents' original tenant) so the scaffold still runs in dev. Admin access,
// however, FAILS CLOSED — an empty allowlist grants nobody admin, regardless.

const DEFAULT_SCHOOL_CODE = "smu";

export function getActiveSchoolCode(): string {
  return (process.env.CAMPUSCORE_SCHOOL_CODE || DEFAULT_SCHOOL_CODE).toLowerCase();
}

export function getActiveSchool(): SchoolEntry {
  const school = findSchoolByCode(getActiveSchoolCode());
  if (school) return school;
  // Unknown code: fall back to the default so the app boots, but make the
  // misconfiguration visible rather than silently accepting all domains.
  const fallback = findSchoolByCode(DEFAULT_SCHOOL_CODE);
  if (!fallback) {
    // Registry is corrupt; fail closed with an obviously-empty school.
    return {
      code: "unknown",
      name: "Unknown",
      category: "moe_school",
      studentDomains: [],
      staffDomains: [],
    };
  }
  return fallback;
}

function emailDomain(email: string): string {
  // Trim BEFORE slicing at the last `@` and BEFORE lowercasing so that a
  // whitespace-padded JWT claim ("  staff@smu.edu.sg  ") normalizes to the
  // same domain as its trimmed form. The `lastIndexOf("@")` (not `indexOf`)
  // is deliberate: RFC 5321/5322 permit `@` inside a quoted local-part, and
  // Clerk's parser splits on the last `@`. Aligning with Clerk keeps the
  // middleware's Layer-2 predicate agreeing with the JWT issuer's Layer-1
  // decision. See design.md § LLD-2 aggregate fix list, item 1.
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  return at === -1 ? "" : trimmed.slice(at + 1).toLowerCase();
}

/** True if the email belongs to this school (student OR staff domain). */
export function isSchoolMemberEmail(email: string): boolean {
  const school = getActiveSchool();
  const domain = emailDomain(email);
  if (!domain) return false;
  return (
    school.studentDomains.includes(domain) ||
    school.staffDomains.includes(domain)
  );
}

/** True if the email is on a staff domain for this school. */
export function isStaffEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return getActiveSchool().staffDomains.includes(domain);
}

/** Parsed admin allowlist (comma/space/newline separated, lowercased). */
export function getAdminAllowlist(): string[] {
  return (process.env.CAMPUSCORE_ADMIN_ALLOWLIST || "")
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Authorized admin = verified staff-domain email AND on the allowlist.
 * FAILS CLOSED: an empty/unset allowlist grants admin to nobody, even with a
 * valid staff email. Domain match alone is never sufficient (Session-1 decision).
 */
export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  // Trim BEFORE lowercasing so `normalized` matches the same
  // trim-then-lowercase pipeline `getAdminAllowlist()` applies to each
  // env-var token. Without the trim, a whitespace-padded JWT claim would
  // slip past the allowlist's `.includes` comparison. See design.md § LLD-2
  // table row: "Trim is currently absent. Fix: trim before lowercase."
  const normalized = email.trim().toLowerCase();
  if (!isStaffEmail(normalized)) return false;
  return getAdminAllowlist().includes(normalized);
}

// Re-export so callers can list deployable schools (e.g. a setup script).
export { SCHOOL_REGISTRY };
