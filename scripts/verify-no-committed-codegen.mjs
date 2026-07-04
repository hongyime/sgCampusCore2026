#!/usr/bin/env node
// scripts/verify-no-committed-codegen.mjs
//
// SESSION-3 TASK-23 UPDATE (2026-06-30):
//
// Property 6 as originally written required `convex/_generated/` to be
// gitignored ("codegen artifacts are never committed"). During Task 23
// we discovered this is incompatible with Convex CLI v1.41's actual
// deploy ordering: `npx convex deploy --cmd 'next build'` runs the cmd
// BEFORE codegen, so on a fresh Vercel clone `next build` cannot resolve
// `@/convex/_generated/*`. Convex's own docs recommend committing the
// files ("your code won't typecheck without it!" —
// https://docs.convex.dev/cli/reference/codegen).
//
// The property has been INVERTED for the session-3 deploy path:
//
//   The generated files MUST exist and MUST be tracked by git so that
//   the Vercel build has them available before `next build` runs. The
//   Convex `deploy` step still overwrites them with fresh output on
//   every push, so drift is bounded to one deploy cycle.
//
// Requirements 1.5 / 10.1 / 10.2 need to be updated to reflect this in a
// follow-up (see STATUS.md session-3 entry). Until then this script
// enforces the CURRENT reality rather than the stale text.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// The five files Convex codegen produces. All must be tracked.
const REQUIRED_TRACKED_FILES = [
  "convex/_generated/api.js",
  "convex/_generated/api.d.ts",
  "convex/_generated/dataModel.d.ts",
  "convex/_generated/server.js",
  "convex/_generated/server.d.ts",
];

let stdout;
try {
  stdout = execFileSync(
    "git",
    ["ls-files", "--", "convex/_generated/"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
} catch (err) {
  const reason =
    err && err.code === "ENOENT"
      ? "git executable not found on PATH"
      : (err && err.stderr && err.stderr.toString().trim()) ||
        (err && err.message) ||
        "unknown error";
  console.error("");
  console.error("verify-no-committed-codegen: FAIL");
  console.error(`  Could not run \`git ls-files\`: ${reason}`);
  process.exit(1);
}

const trackedFiles = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const missing = REQUIRED_TRACKED_FILES.filter(
  (required) => !trackedFiles.includes(required),
);

if (missing.length > 0) {
  console.error("");
  console.error("verify-no-committed-codegen: FAIL");
  console.error(
    `  ${missing.length} required codegen file(s) not tracked by git.`,
  );
  console.error(
    "  Convex codegen must be committed for the Vercel build to resolve",
  );
  console.error(
    "  @/convex/_generated/* imports before `next build` runs.",
  );
  console.error(
    "  Fix: run `npx convex dev --once` locally, then `git add convex/_generated/`.",
  );
  console.error("");
  for (const file of missing) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

console.log(
  `verify-no-committed-codegen: OK ` +
    `(${trackedFiles.length} tracked files under convex/_generated/)`,
);
