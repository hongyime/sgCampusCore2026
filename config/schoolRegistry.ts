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
    studentDomains: ["smu.edu.sg"],
    staffDomains: ["smu.edu.sg"],
  },
  {
    code: "nus",
    name: "National University of Singapore",
    category: "autonomous_university",
    studentDomains: ["u.nus.edu"],
    staffDomains: ["nus.edu.sg"],
  },
  {
    code: "ntu",
    name: "Nanyang Technological University",
    category: "autonomous_university",
    studentDomains: ["e.ntu.edu.sg"],
    staffDomains: ["ntu.edu.sg"],
  },
  {
    code: "sutd",
    name: "Singapore University of Technology and Design",
    category: "autonomous_university",
    studentDomains: ["mymail.sutd.edu.sg"],
    staffDomains: ["sutd.edu.sg"],
  },
  {
    code: "sit",
    name: "Singapore Institute of Technology",
    category: "autonomous_university",
    studentDomains: ["singaporetech.edu.sg"], // verify student subdomain
    staffDomains: ["singaporetech.edu.sg"],
  },
  {
    code: "suss",
    name: "Singapore University of Social Sciences",
    category: "autonomous_university",
    studentDomains: ["suss.edu.sg"], // verify student subdomain
    staffDomains: ["suss.edu.sg"],
  },

  // --- Polytechnics (NP = Ngee Ann, NYP = Nanyang — do not swap) ---
  {
    code: "np",
    name: "Ngee Ann Polytechnic",
    category: "polytechnic",
    studentDomains: ["student.np.edu.sg"], // verify
    staffDomains: ["np.edu.sg"],
  },
  {
    code: "sp",
    name: "Singapore Polytechnic",
    category: "polytechnic",
    studentDomains: ["ichat.sp.edu.sg"], // verify
    staffDomains: ["sp.edu.sg"],
  },
  {
    code: "tp",
    name: "Temasek Polytechnic",
    category: "polytechnic",
    studentDomains: ["student.tp.edu.sg"], // verify
    staffDomains: ["tp.edu.sg"],
  },
  {
    code: "nyp",
    name: "Nanyang Polytechnic",
    category: "polytechnic",
    studentDomains: ["stu.nyp.edu.sg"], // verify
    staffDomains: ["nyp.edu.sg"],
  },
  {
    code: "rp",
    name: "Republic Polytechnic",
    category: "polytechnic",
    studentDomains: ["myrp.edu.sg"], // verify
    staffDomains: ["rp.edu.sg"],
  },

  // --- ITE ---
  {
    code: "ite",
    name: "Institute of Technical Education",
    category: "ite",
    studentDomains: ["ite.edu.sg"], // verify student subdomain
    staffDomains: ["ite.edu.sg"],
  },

  // --- MOE schools (primary/secondary/JC) ---
  // Students nationwide use Student iCON (@students.edu.sg); staff use
  // @moe.edu.sg / @schools.gov.sg. A single MOE-school deployment would scope
  // further by the school's own identifier, since the domain is shared.
  {
    code: "moe-school",
    name: "MOE School (generic — Student iCON)",
    category: "moe_school",
    studentDomains: ["students.edu.sg"],
    staffDomains: ["moe.edu.sg", "schools.gov.sg"],
  },
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
