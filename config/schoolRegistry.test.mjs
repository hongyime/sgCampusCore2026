// Registry static shape test — Task 2.1 of multi-school-template-hardening.
//
// Enforces the four Registry_Static_Test invariants specified in
// design.md § LLD-1 Step 3 and Requirements 1.1, 1.2, 1.5, 1.7:
//
//   1) Every `code` is unique across the array (R1.1, Property P6 —
//      example-based companion to the property test in Task 3.4).
//   2) Every studentDomains and staffDomains entry is lowercased,
//      non-empty, and contains no `@` character (R1.2).
//   3) Every entry without a populated `verified` block has a
//      `// verify` source comment within 6 lines of its `code:` line
//      (R1.5, LLD-1 Step 3 last bullet).
//   4) `REGISTRY_SCHEMA_VERSION` is an integer >= 1 (R1.7).
//
// TypeScript import note:
//   Node >= 22.6 (this repo runs v26.x) strips TypeScript type-only
//   syntax at import time when the specifier ends in `.ts`, so we can
//   import `./schoolRegistry.ts` directly from an `.mjs` test without
//   a loader, a build step, or a new devDependency. This matches the
//   task's "no new devDependency required" constraint and AGENTS.md
//   § "Approval Checkpoints" (no new deps beyond the current stack).
//   Session-3's `config/school.test.mjs` predates Node's native TS
//   support in this workspace and uses a hand-ported mirror instead;
//   this file uses direct import because Requirement 1.1 (uniqueness)
//   must run against the actual runtime array, not a mirror.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

import { SCHOOL_REGISTRY, REGISTRY_SCHEMA_VERSION } from "./schoolRegistry.ts";

// R1.1 / Property P6 (example-based companion). Codes are the deployment
// selector via CAMPUSCORE_SCHOOL_CODE; a duplicate would silently shadow.
test("every SchoolEntry code is unique", () => {
  const codes = SCHOOL_REGISTRY.map((s) => s.code);
  const unique = new Set(codes);
  assert.equal(
    unique.size,
    SCHOOL_REGISTRY.length,
    `duplicate code(s) in SCHOOL_REGISTRY: codes=${JSON.stringify(codes)}`,
  );
});

// R1.2. Domain arrays feed isSchoolMemberEmail / isStaffEmail after the
// email side of the compare has been trimmed-then-lowercased in
// config/school.ts (§ LLD-2 aggregate fix list). If a registry entry
// carries an uppercase letter, a leading `@`, or an empty string, the
// predicate silently mis-classifies. This is a strict shape check.
test("every studentDomains and staffDomains entry is lowercase, non-empty, and contains no @", () => {
  for (const entry of SCHOOL_REGISTRY) {
    const allDomains = [...entry.studentDomains, ...entry.staffDomains];
    for (const d of allDomains) {
      assert.equal(
        typeof d,
        "string",
        `entry ${entry.code}: non-string domain ${JSON.stringify(d)}`,
      );
      assert.ok(
        d.length > 0,
        `entry ${entry.code}: empty-string domain in ${JSON.stringify(allDomains)}`,
      );
      assert.equal(
        d,
        d.toLowerCase(),
        `entry ${entry.code}: non-lowercase domain ${JSON.stringify(d)}`,
      );
      assert.ok(
        !d.includes("@"),
        `entry ${entry.code}: domain contains '@' — should be "school.edu.sg" not "@school.edu.sg": ${JSON.stringify(d)}`,
      );
    }
  }
});

// R1.5 / § LLD-1 Step 3 last bullet. An entry without a populated
// `verified` block is provenance-unknown and must at minimum carry a
// `// verify` source comment so a reviewer sees the gap. The check is
// intentionally on the source file (not the runtime object) because
// the comment IS the provenance signal until Task 1.2's `verified`
// block is populated per-entry (which requires human verification
// via WAITING_ON_HUMAN.md, Task 1.5).
test("every entry has verified block OR // verify comment in source", () => {
  const source = readFileSync(
    new URL("./schoolRegistry.ts", import.meta.url),
    "utf8",
  );
  const lines = source.split(/\r?\n/);

  for (const entry of SCHOOL_REGISTRY) {
    if (entry.verified) {
      // Populated verified block satisfies R1.5 unconditionally.
      continue;
    }

    // Find the `code: "<entry.code>"` line for this entry. Use a
    // JSON-encoded string so an entry code containing regex metachars
    // (e.g. the hyphen in "moe-school") is matched literally.
    const codeMarker = `code: ${JSON.stringify(entry.code)}`;
    const codeLineIdx = lines.findIndex((line) => line.includes(codeMarker));
    assert.notEqual(
      codeLineIdx,
      -1,
      `could not locate '${codeMarker}' in config/schoolRegistry.ts source (parser drift?)`,
    );

    // Search a 6-line window starting at the `code:` line for the
    // `// verify` comment. Six lines covers the entry's typical block
    // (code / name / category / studentDomains / staffDomains / close-brace).
    const windowEnd = Math.min(codeLineIdx + 6, lines.length);
    const window = lines.slice(codeLineIdx, windowEnd).join("\n");
    assert.ok(
      window.includes("// verify"),
      `entry ${entry.code}: no populated 'verified' field and no '// verify' comment within 6 lines of '${codeMarker}' (R1.5). Add either a populated \`verified\` block per Task 1.2 or a \`// verify\` comment per LLD-1 Step 1 before merge.`,
    );
  }
});

// R1.7. REGISTRY_SCHEMA_VERSION pins the shape of SchoolEntry for
// downstream forks; a fork can `if (REGISTRY_SCHEMA_VERSION > known)`
// to detect a breaking upstream change with one integer compare.
test("REGISTRY_SCHEMA_VERSION is an integer >= 1", () => {
  assert.equal(
    typeof REGISTRY_SCHEMA_VERSION,
    "number",
    `REGISTRY_SCHEMA_VERSION is ${typeof REGISTRY_SCHEMA_VERSION}, expected number`,
  );
  assert.ok(
    Number.isInteger(REGISTRY_SCHEMA_VERSION),
    `REGISTRY_SCHEMA_VERSION is not an integer: ${REGISTRY_SCHEMA_VERSION}`,
  );
  assert.ok(
    REGISTRY_SCHEMA_VERSION >= 1,
    `REGISTRY_SCHEMA_VERSION must be >= 1, got ${REGISTRY_SCHEMA_VERSION}`,
  );
});
