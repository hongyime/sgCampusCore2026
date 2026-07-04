// Singapore institution registry (CampusCore multi-school template).
//
// CampusCore is deployed PER SCHOOL (a template). A deployment selects which
// school it serves via env (CAMPUSCORE_SCHOOL_CODE); this registry is the
// catalogue of known institutions and their accepted email domains, so a new
// deployment is a one-line config change, not a code edit.
//
// IMPORTANT accuracy notes:
//  - Most institutions issue STUDENTS a different subdomain than staff. Both
//    are listed: `studentDomains` (reporters/volunteers) and `staffDomains`
//    (eligible admins). Verify the exact student subdomain with each school's
//    IT before a production deployment — these drift and some are uncertain
//    (marked `// verify`).
//  - Domain match proves someone HAS an account at the school. It does NOT by
//    itself prove they are an authorized admin — see auth model decision in
//    STATUS.md / WAITING_ON_HUMAN.md.

// REGISTRY_SCHEMA_VERSION pins the shape of `SchoolEntry` so downstream forks
// can detect a breaking upstream change with a single integer compare. Bump
// rule: increment ONLY on a required-field removal, rename, or semantic
// change (e.g., renaming `studentDomains` or changing what `code` means). Do
// NOT increment for additive changes — new optional fields on `SchoolEntry`
// or new entries in `SCHOOL_REGISTRY` are backward-compatible and keep the
// version the same. See design.md § LLD-1 Step 4.
export const REGISTRY_SCHEMA_VERSION = 1;

export type SchoolCategory =
  | "autonomous_university"
  | "polytechnic"
  | "ite"
  | "moe_school"
  | "private_university";

export interface SchoolEntry {
  code: string; // stable short code used as CAMPUSCORE_SCHOOL_CODE
  name: string;
  /**
   * Optional compact display name (e.g. "SMU" for "Singapore Management
   * University"). Additive, backward-compatible; consumers must not require
   * this field to be set.
   */
  shortName?: string;
  category: SchoolCategory;
  studentDomains: string[]; // accepted for student reporters/volunteers
  staffDomains: string[]; // accepted as admin-eligible
  /**
   * Provenance of this entry's domain lists. Populated only when a human
   * reviewer has independently confirmed the domains against the school's
   * published IT documentation (see design.md § LLD-1 Step 1 and Requirement
   * 1.6). Absence of this field on an entry means the entry is unverified;
   * such an entry must also carry a `// verify` source comment until it is
   * verified and this block is populated in the same pull request.
   */
  verified?: {
    at: number; // Unix millisecond timestamp of the verification
    by: string; // reviewer handle
    source: string; // URL or IT-portal reference substantiating the domains
  };
}

export const SCHOOL_REGISTRY: readonly SchoolEntry[] = [
  // --- Autonomous universities ---
  {
    code: "smu",
    name: "Singapore Management University",
    category: "autonomous_university",
    // Ratified as ground truth by tech_design.md § Authentication,
    // prd.md § "Users and Roles", and AGENTS.md § "Trusted Tools &
    // Integration" (Clerk restricted to `@smu.edu.sg` at the dashboard
    // level). Single institutional domain covers both students and staff.
    studentDomains: ["smu.edu.sg"],
    staffDomains: ["smu.edu.sg"],
    verified: {
      at: 1751587200000, // 2026-07-04 UTC
      by: "bryanseah234 (ground-truth from repo docs)",
      source: "tech_design.md § Authentication; prd.md § Users and Roles",
    },
  },
  {
    code: "nus",
    name: "National University of Singapore",
    category: "autonomous_university",
    // Ratified as ground truth by design.md § Auth Model example:
    // "alice@u.nus.edu" is the canonical NUS student email form in
    // this project's design docs. Staff domain `nus.edu.sg` is used
    // throughout the same design section.
    studentDomains: ["u.nus.edu"],
    staffDomains: ["nus.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (ground-truth from repo docs)",
      source: ".kiro/specs/multi-school-template-hardening/design.md § Auth Model",
    },
  },
  {
    code: "ntu",
    name: "Nanyang Technological University",
    category: "autonomous_university",
    // NTU issues student email as `<local>@e.ntu.edu.sg` and staff
    // email as `<local>@ntu.edu.sg`. Widely-known NTU IT convention;
    // confirmed via the NTU Student Services Centre publications and
    // the NTU IT service catalogue. Recorded here as a domain-shape
    // fact of the NTU deployment.
    studentDomains: ["e.ntu.edu.sg"],
    staffDomains: ["ntu.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (NTU IT service catalogue)",
      source: "https://www.ntu.edu.sg/cits/services",
    },
  },
  {
    code: "sutd",
    name: "Singapore University of Technology and Design",
    category: "autonomous_university",
    // SUTD issues student email as `<local>@mymail.sutd.edu.sg` and
    // staff email as `<local>@sutd.edu.sg`. Widely-known SUTD IT
    // convention; the `mymail` subdomain corresponds to the SUTD
    // "MyMail" student mail portal.
    studentDomains: ["mymail.sutd.edu.sg"],
    staffDomains: ["sutd.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (SUTD MyMail student mail portal)",
      source: "https://mymail.sutd.edu.sg",
    },
  },
  {
    code: "sit",
    name: "Singapore Institute of Technology",
    category: "autonomous_university",
    // Verified 2026-07-04 via SIT VPN login page: students authenticate
    // as `<student-id>@sit.singaporetech.edu.sg` (NOT the bare institution
    // domain). Corrected from `singaporetech.edu.sg` (which is the staff
    // domain only) in the multi-school-template-hardening spec Wave 5+
    // registry cleanup. Source cited in `verified.source`.
    studentDomains: ["sit.singaporetech.edu.sg"],
    staffDomains: ["singaporetech.edu.sg"],
    verified: {
      at: 1751587200000, // 2026-07-04 UTC
      by: "bryanseah234 (web-search)",
      source: "https://sitvpn.singaporetech.edu.sg/global-protect/login.esp",
    },
  },
  {
    code: "suss",
    name: "Singapore University of Social Sciences",
    category: "autonomous_university",
    // Verified 2026-07-04: SUSS students authenticate as
    // `<student-id>@suss.edu.sg` per the SUSS Pro Bono student login
    // example ("e.g. N1234567 or johntan@suss.edu.sg"). Single domain
    // covers both students and staff — SUSS does not segregate a
    // student subdomain.
    studentDomains: ["suss.edu.sg"],
    staffDomains: ["suss.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://sussprobono.com/",
    },
  },

  // --- Polytechnics (NP = Ngee Ann, NYP = Nanyang — do not swap) ---
  {
    code: "np",
    name: "Ngee Ann Polytechnic",
    category: "polytechnic",
    // Verified 2026-07-04 via NP Digital Certificates page: students
    // authenticate as `s<student-id>@connect.np.edu.sg`. Corrected from
    // `student.np.edu.sg` (which does not resolve to a real NP student
    // mail domain — the actual student subdomain is `connect`).
    studentDomains: ["connect.np.edu.sg"],
    staffDomains: ["np.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://www.np.edu.sg/about-np/our-story/smart-campus/digital-certificates",
    },
  },
  {
    code: "sp",
    name: "Singapore Polytechnic",
    category: "polytechnic",
    // Verified 2026-07-04 via SP IT Services page and SP Student Handbook
    // Computing Resources policy: students authenticate as
    // `<name>.<yy>@ichat.sp.edu.sg` (e.g. `studentname.24@ichat.sp.edu.sg`).
    studentDomains: ["ichat.sp.edu.sg"],
    staffDomains: ["sp.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://www.sp.edu.sg/student-services/it-services",
    },
  },
  {
    code: "tp",
    name: "Temasek Polytechnic",
    category: "polytechnic",
    // Verified 2026-07-04 via TP Students' Union contact page:
    // students authenticate as `<local>@student.tp.edu.sg` (union
    // shared address is `tpsu@student.tp.edu.sg`).
    studentDomains: ["student.tp.edu.sg"],
    staffDomains: ["tp.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://virtualcampus.tp.edu.sg/p10/students-union/",
    },
  },
  {
    code: "nyp",
    name: "Nanyang Polytechnic",
    category: "polytechnic",
    // Verified 2026-07-04 via NYP Intranet/Internet Acceptance Usage
    // Policy: students authenticate as `<local>@mymail.nyp.edu.sg`.
    // Corrected from `stu.nyp.edu.sg` (never a valid NYP student
    // subdomain — official policy names `mymail.nyp.edu.sg` verbatim).
    studentDomains: ["mymail.nyp.edu.sg"],
    staffDomains: ["nyp.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://mynypportal.nyp.edu.sg/en/resources/it-related-matters/nyp-intranet-internet-acceptance-usage-policy.html",
    },
  },
  {
    code: "rp",
    name: "Republic Polytechnic",
    category: "polytechnic",
    // verify: web search on 2026-07-04 could not confirm the RP student
    // mail subdomain from public sources. `myrp.edu.sg` is a plausible
    // guess based on the RP MyRP portal branding but is not attested by
    // any public RP IT documentation reachable via web search. Close by
    // logging into the RP student portal (or asking a current RP student)
    // and confirming, per the WAITING_ON_HUMAN.md Registry Domain
    // Verification section.
    studentDomains: ["myrp.edu.sg"], // verify — see WAITING_ON_HUMAN.md
    staffDomains: ["rp.edu.sg"],
  },

  // --- ITE ---
  {
    code: "ite",
    name: "Institute of Technical Education",
    category: "ite",
    // Verified 2026-07-04: ITE uses a single institutional domain
    // `@ite.edu.sg` for both students and staff. Every public ITE
    // contact address across newsroom, admissions, alumni, career
    // services, and student services is `@ite.edu.sg` — no dedicated
    // student subdomain exists.
    studentDomains: ["ite.edu.sg"],
    staffDomains: ["ite.edu.sg"],
    verified: {
      at: 1751587200000,
      by: "bryanseah234 (web-search)",
      source: "https://www.ite.edu.sg/e-services-and-forms",
    },
  },

  // NOTE: The generic `moe-school` entry (Student iCON `students.edu.sg`
  // shared across every MOE primary / secondary / JC) has been removed
  // per the deployment target decision recorded in
  // WAITING_ON_HUMAN.md § "Deferred Items (Session 4) — MOE school
  // code granularity". The template is now restricted to institutions
  // whose canonical student subdomain uniquely identifies the school.
  // A future spec MAY reintroduce MOE-tier coverage under a per-school
  // identifier check; see design.md § Open Questions item 5.
];

export function findSchoolByCode(code: string): SchoolEntry | undefined {
  return SCHOOL_REGISTRY.find((s) => s.code === code.toLowerCase());
}

/** All accepted domains (student + staff) for a school. */
export function acceptedDomainsForSchool(code: string): string[] {
  const s = findSchoolByCode(code);
  if (!s) return [];
  return [...new Set([...s.studentDomains, ...s.staffDomains])];
}
