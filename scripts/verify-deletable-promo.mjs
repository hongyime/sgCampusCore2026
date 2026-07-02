#!/usr/bin/env node
// scripts/verify-deletable-promo.mjs
//
// Enforces Property 3 of the Session-3 design (design.md §Correctness
// Properties, Requirements 7.7, 8.5, 12.5):
//
//   For any file F referenced by any route under `app/dashboard/`,
//   `app/volunteer/`, `app/admin/`, `app/api/`, or `middleware.ts`, F
//   does NOT live under `app/(promo)/` or `components/promo/`.
//
//   Equivalently: deleting `app/(promo)/` and `components/promo/` in one
//   commit still leaves `npm run build` green.
//
// The check is a regex-based scan of import statements, dynamic
// `import(...)` expressions, and `require(...)` calls in every source
// file under the SMU-app subtrees. Any import specifier whose path
// contains `app/(promo)` or `components/promo` is a violation, whether
// the specifier is `@/app/(promo)/...`, `../app/(promo)/...`,
// `@/components/promo/...`, or any other path shape.
//
// No dependencies. Node 18+ (uses ESM + node:fs). Exits 0 on pass, 1 on
// fail. Prints a short human-readable report.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, join, sep } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// -- Configuration --------------------------------------------------------

// SMU-app subtrees + the single middleware file. A missing entry is
// silently skipped so this script is safe to run before Task 8 has
// created `app/volunteer/` or `app/admin/`.
const SCAN_ROOTS = [
  "app/dashboard",
  "app/volunteer",
  "app/admin",
  "app/api",
  "middleware.ts",
];

// File extensions worth scanning for imports. Everything else (JSON,
// CSS, images, markdown) can't carry a JS/TS import.
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

// Directories to prune from recursive walks.
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".convex",
  ".omo",
]);

// Forbidden path fragments. Matched as substrings against every import
// specifier — so `@/app/(promo)/page`, `../../app/(promo)/Hero`, and
// `@/components/promo/Footer` all trip.
const FORBIDDEN_FRAGMENTS = ["app/(promo)", "components/promo"];

// -- Import-specifier extraction ------------------------------------------

// Static imports and re-exports:
//   import X from "..."      import "..."      import type ... from "..."
//   export * from "..."      export { X } from "..."
const STATIC_IMPORT_RE =
  /\b(?:import|export)\b(?:\s+type)?(?:\s+[^'"`;]*?\bfrom\b)?\s*['"]([^'"\n]+)['"]/g;

// Dynamic imports and CommonJS require:
//   import("...")            require("...")
// Also catches `await import('...')` and `const x = require("...")`.
const DYNAMIC_IMPORT_RE =
  /\b(?:import|require)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

function extractSpecifiers(text) {
  const specs = [];
  let m;

  STATIC_IMPORT_RE.lastIndex = 0;
  while ((m = STATIC_IMPORT_RE.exec(text)) !== null) {
    specs.push({ spec: m[1], index: m.index });
  }

  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(text)) !== null) {
    specs.push({ spec: m[1], index: m.index });
  }

  return specs;
}

function isForbidden(spec) {
  return FORBIDDEN_FRAGMENTS.some((fragment) => spec.includes(fragment));
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

// -- File walk ------------------------------------------------------------

function* walk(rootAbs) {
  const stack = [rootAbs];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        yield full;
      }
    }
  }
}

function hasSourceExtension(path) {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return SOURCE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

// -- Main scan ------------------------------------------------------------

const violations = [];
const scannedFiles = [];
const skippedRoots = [];

for (const rel of SCAN_ROOTS) {
  const abs = resolve(repoRoot, rel);
  if (!existsSync(abs)) {
    skippedRoots.push(rel);
    continue;
  }
  const st = statSync(abs);
  const filesToScan = st.isDirectory() ? [...walk(abs)] : [abs];
  for (const file of filesToScan) {
    if (!hasSourceExtension(file)) continue;
    scannedFiles.push(file);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      violations.push({
        file,
        line: 0,
        spec: `<read-error: ${err.message}>`,
      });
      continue;
    }
    for (const { spec, index } of extractSpecifiers(text)) {
      if (isForbidden(spec)) {
        violations.push({
          file,
          line: lineNumberAt(text, index),
          spec,
        });
      }
    }
  }
}

// -- Report ---------------------------------------------------------------

for (const rel of skippedRoots) {
  console.log(`note: skipped missing path ${rel}`);
}

console.log(
  `verify-deletable-promo: scanned ${scannedFiles.length} file(s) ` +
    `across ${SCAN_ROOTS.length - skippedRoots.length} root(s).`
);

if (violations.length > 0) {
  console.error("");
  console.error("verify-deletable-promo: FAIL");
  console.error(
    "  SMU-app code must not import from app/(promo)/ or components/promo/."
  );
  console.error(
    "  Deleting those directories in one commit must leave the app green."
  );
  console.error("");
  for (const v of violations) {
    const relFile = relative(repoRoot, v.file).split(sep).join("/");
    console.error(`  ${relFile}:${v.line}  imports "${v.spec}"`);
  }
  process.exit(1);
}

console.log("verify-deletable-promo: OK");
