#!/usr/bin/env node
// scripts/verify-env-boundary.mjs
//
// Enforces Property 1 of the Session-3 design (design.md §Correctness
// Properties, Requirements 4.5, 4.6, 5.6, 10.4):
//
//   For every variable in the Convex-only server-var set, the name does
//   NOT begin with `NEXT_PUBLIC_`, and the name does NOT appear in the
//   DEPLOYMENT.md Vercel checklist section — except the three
//   deliberately mirrored variables (TELEGRAM_WEBHOOK_SECRET,
//   CAMPUSCORE_SCHOOL_CODE, CAMPUSCORE_ADMIN_ALLOWLIST).
//
// No dependencies. Node 18+ (uses ESM + node:fs). Exits 0 on pass, 1 on
// fail. Prints a short human-readable report.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// -- Configuration --------------------------------------------------------

// The Convex-only server-var set. These variables belong exclusively to
// Convex_Env (design §C3). None of them may be prefixed NEXT_PUBLIC_, and
// none of them may appear in the Vercel Environment Variables checklist.
const CONVEX_ONLY_SERVER_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "GROQ_API_KEY",
  "LLM_BASE_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_ESCALATION_TO",
  "NSFW_MODEL_URL",
  "CLERK_JWT_ISSUER_DOMAIN",
];

// The three deliberately mirrored variables (Requirement 4.4). Present in
// both runtimes; therefore they are allowed to appear in the Vercel
// checklist even though they are also set in Convex_Env.
const MIRRORED_VARS = new Set([
  "TELEGRAM_WEBHOOK_SECRET",
  "CAMPUSCORE_SCHOOL_CODE",
  "CAMPUSCORE_ADMIN_ALLOWLIST",
]);

// Recognized DEPLOYMENT.md Vercel checklist section headers. The design
// (§C7) names this section various ways depending on version — accept any
// H2/H3 header that mentions Vercel or Next/Vercel Env.
const VERCEL_SECTION_HEADER_PATTERNS = [
  /^#{2,3}\s+.*(?:next\s*\/\s*vercel|vercel)\s*env/i,
  /^#{2,3}\s+vercel\s+(?:project\s+)?(?:environment\s+)?variables/i,
  /^#{2,3}\s+vercel\s+checklist/i,
  /^#{2,3}\s+vercel\s+setup/i,
];

// Any subsequent H2 header ends the current section.
const NEXT_H2_HEADER = /^##\s+\S/;

const errors = [];
const notes = [];

// -- Check 1: hardcoded set self-consistency ------------------------------

for (const name of CONVEX_ONLY_SERVER_VARS) {
  if (name.startsWith("NEXT_PUBLIC_")) {
    errors.push(
      `Convex-only server var "${name}" begins with NEXT_PUBLIC_ ` +
        `(would inline into the browser bundle).`
    );
  }
}

// -- Check 2: .env.example does not declare a NEXT_PUBLIC_ sibling --------

const envExamplePath = resolve(repoRoot, ".env.example");
if (existsSync(envExamplePath)) {
  const envText = readFileSync(envExamplePath, "utf8");
  const declaredNames = new Set();
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) declaredNames.add(m[1]);
  }
  for (const name of CONVEX_ONLY_SERVER_VARS) {
    const publicSibling = `NEXT_PUBLIC_${name}`;
    if (declaredNames.has(publicSibling)) {
      errors.push(
        `.env.example declares "${publicSibling}" — a Convex-only ` +
          `server var must not have a NEXT_PUBLIC_ sibling.`
      );
    }
  }
} else {
  notes.push(".env.example not found; skipping sibling-prefix check.");
}

// -- Check 3: DEPLOYMENT.md Vercel checklist section ----------------------

const deploymentPath = resolve(repoRoot, "DEPLOYMENT.md");
if (existsSync(deploymentPath)) {
  const lines = readFileSync(deploymentPath, "utf8").split(/\r?\n/);

  // Locate the Vercel section (first matching header). End at the next H2.
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (sectionStart === -1) {
      if (VERCEL_SECTION_HEADER_PATTERNS.some((re) => re.test(lines[i]))) {
        sectionStart = i + 1;
      }
    } else if (NEXT_H2_HEADER.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  if (sectionStart === -1) {
    notes.push(
      "DEPLOYMENT.md has no recognizable Vercel checklist section " +
        "header; treating as pass-through (Task-20 will rewrite this file)."
    );
  } else {
    const sectionText = lines.slice(sectionStart, sectionEnd).join("\n");
    for (const name of CONVEX_ONLY_SERVER_VARS) {
      if (MIRRORED_VARS.has(name)) continue; // n/a — set has no mirrors
      const re = new RegExp(`\\b${name}\\b`);
      if (re.test(sectionText)) {
        errors.push(
          `DEPLOYMENT.md Vercel checklist section lists Convex-only ` +
            `server var "${name}". It must be set in Convex_Env only.`
        );
      }
    }
  }
} else {
  notes.push("DEPLOYMENT.md not found; skipping checklist check.");
}

// -- Report ---------------------------------------------------------------

for (const n of notes) {
  console.log(`note: ${n}`);
}

if (errors.length > 0) {
  console.error("");
  console.error("verify-env-boundary: FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("verify-env-boundary: OK");
