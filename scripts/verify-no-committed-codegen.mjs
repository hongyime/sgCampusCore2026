#!/usr/bin/env node
// scripts/verify-no-committed-codegen.mjs
//
// Enforces Property 6 of the Session-3 design (design.md §Correctness
// Properties, Requirements 1.5, 10.1, 10.2):
//
//   For any commit reachable from origin/main, the tree does not contain
//   files under `convex/_generated/`.
//
//   Equivalently: `git ls-files convex/_generated/` returns an empty
//   result — the Convex codegen output is regenerated per deploy rather
//   than committed to source control.
//
// The check shells out to `git ls-files -- convex/_generated/` using
// execFileSync (argv array, not shell-string) so no user-controlled
// interpolation reaches a shell. Any non-empty stdout is a violation.
//
// No dependencies. Node 18+ (uses ESM + node:child_process). Exits 0 on
// pass, 1 on fail. Prints a short human-readable report.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// -- Configuration --------------------------------------------------------

// The path (repo-relative) that must never contain tracked files. Passed
// as a discrete argv entry to git; not interpolated into a shell string.
const FORBIDDEN_TRACKED_PATH = "convex/_generated/";

// -- Run git --------------------------------------------------------------

let stdout;
try {
  stdout = execFileSync(
    "git",
    ["ls-files", "--", FORBIDDEN_TRACKED_PATH],
    {
      cwd: repoRoot,
      encoding: "utf8",
      // git prints tracked paths to stdout; anything on stderr (e.g. the
      // "not a git repository" message) is captured for the failure path.
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
} catch (err) {
  // Two distinct failure modes to distinguish for the operator:
  //   - `git` is not on PATH (ENOENT)
  //   - not a git repo, or git errored otherwise
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

// -- Evaluate result ------------------------------------------------------

const trackedFiles = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

if (trackedFiles.length > 0) {
  console.error("");
  console.error("verify-no-committed-codegen: FAIL");
  console.error(
    `  ${trackedFiles.length} file(s) under ${FORBIDDEN_TRACKED_PATH} ` +
      "are tracked by git."
  );
  console.error(
    "  Convex codegen must be regenerated per deploy, not committed."
  );
  console.error(
    "  Fix: `git rm --cached -r convex/_generated/` and confirm " +
      "`convex/_generated/` is listed in .gitignore."
  );
  console.error("");
  for (const file of trackedFiles) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

console.log(
  `verify-no-committed-codegen: OK ` +
    `(0 tracked files under ${FORBIDDEN_TRACKED_PATH})`
);
