// Unit tests for the Resend escalation email stub-mode policy
// (Session 3, Property 5 — partial configuration is never treated as configured).
//
// WHY THIS IS A MIRROR, NOT AN IMPORT:
//   convex/lib/resend.ts imports "../_generated/server" (Convex codegen, only
//   present after `npx convex dev --once` has run) and the "resend" npm
//   package. The Session-3 task list forbids adding a new devDependency, and
//   Node's built-in `node --test` runner cannot load the TypeScript module
//   without a loader. So this file inlines a plain-JavaScript port of the
//   stub-mode policy — the *policy* being tested is the env-var check plus
//   the fetch-touching branch that Resend's SDK would take, not the SDK
//   itself.
//
//   The invariant we protect (Property 5, Requirement 4.7): when any one of
//   RESEND_API_KEY, RESEND_FROM_EMAIL, or RESEND_ESCALATION_TO is unset, the
//   send path stays in stub/log mode and does not attempt a network call.
//   When all three are set, a dispatch attempt IS made — the fetch spy sees
//   it and the boolean flips.
//
// DRIFT GUARD:
//   The final describe() block re-reads convex/lib/resend.ts from disk and
//   asserts that the three env-var names and the "if (!apiKey || !from || !to)"
//   guard shape still exist verbatim. If someone renames a variable, weakens
//   the guard to OR-of-two, or flips it to AND-of-any, the drift guard fails
//   loudly and this mirror must be updated in lockstep.
//
// Design reference: .kiro/specs/session-3-unblock-and-landing/design.md,
// Property 5. Requirements: 4.7.
//
// Runnable with:  node --test convex/lib/resend.test.mjs
// Or via:         npm run test:unit

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Ported policy — mirrors the env-var guard + fetch-touching branch of
// convex/lib/resend.ts::sendEscalationEmail. Returns { called } so the test
// can assert the boolean flip; also, when the "all three set" branch fires,
// calls the ambient `fetch` global (as Resend's SDK does internally) so a
// spied fetch can catch any attempted dispatch.
// ---------------------------------------------------------------------------

const RESEND_API_URL = "https://api.resend.com/emails";

async function sendEscalationEmailStubCheck(env, args) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  const to = env.RESEND_ESCALATION_TO;

  if (!apiKey || !from || !to) {
    // Stub/log branch — matches the console.warn early-return in resend.ts.
    return { called: false };
  }

  // Fully-configured branch — mirror what Resend's SDK does under the hood:
  // POST to https://api.resend.com/emails via the global fetch. If the fetch
  // global is spied, the spy will observe this call.
  await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `🚨 [URGENT] Escalation: ${args.headline}`,
      html: "<p>stub</p>",
    }),
  });
  return { called: true };
}

// ---------------------------------------------------------------------------
// Env + fetch save/restore — each case runs with a known env slice and a
// fresh fetch spy so leftover state from a prior case cannot mask a stub-mode
// regression or a spurious dispatch.
// ---------------------------------------------------------------------------

const ENV_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_ESCALATION_TO"];
let ORIGINAL_ENV;
let ORIGINAL_FETCH;
let fetchSpy;

const ARGS = {
  ticketId: "tickets:stub",
  reason: "test",
  headline: "burst pipe",
  location_entity: "SMU SIS",
  description: "water everywhere",
};

beforeEach(() => {
  ORIGINAL_ENV = {};
  for (const key of ENV_KEYS) {
    ORIGINAL_ENV[key] = process.env[key];
    delete process.env[key];
  }

  ORIGINAL_FETCH = globalThis.fetch;
  fetchSpy = mock.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "stub-id" }),
    text: async () => "",
  }));
  globalThis.fetch = fetchSpy;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
  globalThis.fetch = ORIGINAL_FETCH;
});

// ---------------------------------------------------------------------------
// Property 5 — Resend escalation stays in stub mode unless fully configured.
// Validates: Requirement 4.7
// Design:    Property 5
// ---------------------------------------------------------------------------

describe("sendEscalationEmail (Property 5: stub unless fully configured)", () => {
  it("stays in stub mode when all three env vars are unset (no fetch dispatch)", async () => {
    const result = await sendEscalationEmailStubCheck({}, ARGS);
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("stays in stub mode when only RESEND_API_KEY is set", async () => {
    const result = await sendEscalationEmailStubCheck(
      { RESEND_API_KEY: "re_test_key" },
      ARGS,
    );
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("stays in stub mode when RESEND_ESCALATION_TO is missing (api key + from set)", async () => {
    const result = await sendEscalationEmailStubCheck(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "alerts@sgcampuscore.example",
      },
      ARGS,
    );
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("stays in stub mode when RESEND_FROM_EMAIL is missing (api key + to set)", async () => {
    const result = await sendEscalationEmailStubCheck(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_ESCALATION_TO: "csoc@smu.edu.sg",
      },
      ARGS,
    );
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("stays in stub mode when RESEND_API_KEY is missing (from + to set)", async () => {
    const result = await sendEscalationEmailStubCheck(
      {
        RESEND_FROM_EMAIL: "alerts@sgcampuscore.example",
        RESEND_ESCALATION_TO: "csoc@smu.edu.sg",
      },
      ARGS,
    );
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("stays in stub mode when a value is present but empty string (falsy check)", async () => {
    const result = await sendEscalationEmailStubCheck(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "alerts@sgcampuscore.example",
        RESEND_ESCALATION_TO: "",
      },
      ARGS,
    );
    assert.equal(result.called, false);
    assert.equal(fetchSpy.mock.callCount(), 0);
  });

  it("attempts dispatch when all three env vars are set (fetch called at Resend endpoint)", async () => {
    const result = await sendEscalationEmailStubCheck(
      {
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "alerts@sgcampuscore.example",
        RESEND_ESCALATION_TO: "csoc@smu.edu.sg",
      },
      ARGS,
    );
    assert.equal(result.called, true);
    assert.ok(fetchSpy.mock.callCount() >= 1, "fetch should have been called at least once");
    const firstCallUrl = fetchSpy.mock.calls[0].arguments[0];
    assert.equal(firstCallUrl, "https://api.resend.com/emails");
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the three env-var names and the shape of the guard
// clause still exist verbatim in convex/lib/resend.ts. If any of these fail,
// the mirror above is stale and MUST be updated in lockstep before the
// source file changes land.
// ---------------------------------------------------------------------------

describe("drift guard: mirror still matches convex/lib/resend.ts", () => {
  const source = readFileSync(resolve(__dirname, "resend.ts"), "utf8");

  it("still reads RESEND_API_KEY from process.env", () => {
    assert.match(
      source,
      /process\.env\.RESEND_API_KEY/,
      "RESEND_API_KEY env-var read missing",
    );
  });

  it("still reads RESEND_FROM_EMAIL from process.env", () => {
    assert.match(
      source,
      /process\.env\.RESEND_FROM_EMAIL/,
      "RESEND_FROM_EMAIL env-var read missing",
    );
  });

  it("still reads RESEND_ESCALATION_TO from process.env", () => {
    assert.match(
      source,
      /process\.env\.RESEND_ESCALATION_TO/,
      "RESEND_ESCALATION_TO env-var read missing",
    );
  });

  it("still guards with `if (!apiKey || !from || !to)` (stub-on-any-missing)", () => {
    assert.match(
      source,
      /if\s*\(\s*!apiKey\s*\|\|\s*!from\s*\|\|\s*!to\s*\)/,
      "Stub-mode guard shape !apiKey || !from || !to has changed",
    );
  });

  it("still returns early (no dispatch) inside the stub branch", () => {
    // The stub branch must exit before the `new Resend(apiKey)` construction.
    // Match a `return;` (or `return undefined;`) inside the guard block.
    assert.match(
      source,
      /if\s*\(\s*!apiKey\s*\|\|\s*!from\s*\|\|\s*!to\s*\)\s*\{[\s\S]*?return\s*;?\s*[;\}]/,
      "Stub-mode branch must return early before any Resend/network call",
    );
  });
});
