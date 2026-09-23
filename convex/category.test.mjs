// Unit tests for the category tap state machine (tech_design.md §3.4).
//
// Tests the tapCategory internal mutation which implements:
//   1. First-write: always honored, sets initial_tap_at, locks triage_status
//   2. Safety first-write: upgrades priority_tier to 1, mirrors to egress queue
//   3. 15-second correction window: category change honored within window
//   4. Post-window: visual-only update (category changes, priority_tier does NOT)
//   5. Not-found: returns { ok: false, reason: "not_found" }
//
// Uses the same loadConvex() + memoryDatabase() pattern as the rest of the suite.
//
// Runnable with:  node --test convex/category.test.mjs
// Or via:         npm run test:unit

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));

// Load the real category.ts handler via transpile-at-runtime.
// Use a controllable clock so we can test the 15-second window precisely.
let now = 1_000_000;
class Clock extends Date {
  static now() {
    return now;
  }
}
const category = loadConvex("category.ts", { Date: Clock });

function fixture() {
  now = 1_000_000;
  const database = memoryDatabase({
    tickets: [
      {
        _id: "ticket-1",
        _creationTime: 1,
        category: null,
        priority_tier: 2,
        triage_status: "awaiting_input",
        initial_tap_at: null,
        created_at: 900_000,
        resolved_at: null,
        location_entity: "SIS Building",
        headline: "Broken window",
        status: "open",
        description: "Window is cracked",
        image_status: "none",
      },
    ],
    telegram_egress_queue: [
      {
        _id: "egress-1",
        _creationTime: 1,
        ticket_id: "ticket-1",
        status: "pending",
        priority_tier: 2,
        claimed_at: null,
        retry_count: 0,
        created_at: 900_000,
        egress_cleared_at: null,
      },
    ],
  });
  const ctx = { db: database.db };
  const tap = (ticketId, cat) =>
    database.atomic(() =>
      category.tapCategory._handler(ctx, { ticketId, category: cat }),
    );
  return { database, ctx, tap };
}

// ---------------------------------------------------------------------------
// First-write behavior
// ---------------------------------------------------------------------------

describe("tapCategory — first write", () => {
  it("sets category, initial_tap_at, and locks triage_status on first tap", async () => {
    const f = fixture();
    const result = plain(await f.tap("ticket-1", "Facilities"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "first_write");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Facilities");
    assert.equal(ticket.initial_tap_at, now);
    assert.equal(ticket.triage_status, "locked");
    assert.equal(ticket.priority_tier, 2); // Non-Safety stays tier 2
  });

  it("Safety first-write upgrades priority_tier to 1 and mirrors to egress queue", async () => {
    const f = fixture();
    const result = plain(await f.tap("ticket-1", "Safety"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "first_write");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Safety");
    assert.equal(ticket.priority_tier, 1);

    const egress = f.database.rows("telegram_egress_queue")[0];
    assert.equal(egress.priority_tier, 1);
  });

  it("Safety first-write on already-tier-1 ticket does not downgrade", async () => {
    const f = fixture();
    // Pre-set ticket to tier 1 (e.g., lexicon match at ingestion)
    await f.database.db.patch("ticket-1", { priority_tier: 1 });
    await f.database.db.patch("egress-1", { priority_tier: 1 });

    const result = plain(await f.tap("ticket-1", "Safety"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "first_write");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.priority_tier, 1); // Stays 1
  });
});

// ---------------------------------------------------------------------------
// 15-second correction window
// ---------------------------------------------------------------------------

describe("tapCategory — 15-second correction window", () => {
  it("correction within 15s is honored", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Facilities"); // First write at now=1_000_000

    now += 10_000; // 10 seconds later — within window
    const result = plain(await f.tap("ticket-1", "Janitorial"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "correction_honored");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Janitorial");
  });

  it("correction at exactly 15s boundary is honored", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Facilities");

    now += 15_000; // Exactly 15 seconds
    const result = plain(await f.tap("ticket-1", "Lost & Found"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "correction_honored");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Lost & Found");
  });

  it("Safety correction within window upgrades tier-2 to tier-1", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Facilities"); // First write, tier stays 2

    now += 5_000; // 5 seconds later
    const result = plain(await f.tap("ticket-1", "Safety"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "correction_honored");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Safety");
    assert.equal(ticket.priority_tier, 1);

    const egress = f.database.rows("telegram_egress_queue")[0];
    assert.equal(egress.priority_tier, 1);
  });

  it("non-Safety correction within window does NOT downgrade tier-1", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Safety"); // First write → tier 1

    now += 5_000;
    const result = plain(await f.tap("ticket-1", "Facilities"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "correction_honored");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Facilities");
    assert.equal(ticket.priority_tier, 1); // Stays 1 — no downgrade
  });
});

// ---------------------------------------------------------------------------
// Post-window: visual-only update
// ---------------------------------------------------------------------------

describe("tapCategory — post-window visual-only", () => {
  it("correction after 15s is visual-only (category changes, priority_tier does NOT)", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Facilities");

    now += 15_001; // 15.001 seconds — past window
    const result = plain(await f.tap("ticket-1", "Safety"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "correction_visual_only");

    const ticket = f.database.rows("tickets")[0];
    assert.equal(ticket.category, "Safety"); // Category updated visually
    assert.equal(ticket.priority_tier, 2); // Priority NOT upgraded
  });

  it("visual-only Safety tap does not mirror to egress queue", async () => {
    const f = fixture();
    await f.tap("ticket-1", "Facilities");

    now += 20_000; // 20 seconds — well past window
    await f.tap("ticket-1", "Safety");

    const egress = f.database.rows("telegram_egress_queue")[0];
    assert.equal(egress.priority_tier, 2); // Egress NOT upgraded
  });
});

// ---------------------------------------------------------------------------
// Not-found
// ---------------------------------------------------------------------------

describe("tapCategory — not found", () => {
  it("returns { ok: false, reason: 'not_found' } for missing ticket", async () => {
    const f = fixture();
    const result = plain(await f.tap("missing-ticket", "Safety"));
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_found");
  });
});

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe("drift guard: category.ts still exports tapCategory with expected branches", () => {
  const source = readFileSync(resolve(__dirname, "category.ts"), "utf8");

  it("exports tapCategory as internalMutation", () => {
    assert.match(source, /export\s+const\s+tapCategory\s*=\s*internalMutation/);
  });

  it("checks ticket.category === null for first-write branch", () => {
    assert.match(source, /ticket\.category\s*===\s*null/);
  });

  it("checks 15-second correction window", () => {
    assert.match(source, /now\s*-\s*ticket\.initial_tap_at\s*<=\s*15000/);
  });

  it("checks Safety category for tier-1 upgrade", () => {
    assert.match(source, /args\.category\s*===\s*"Safety"/);
  });

  it("returns three distinct status values", () => {
    assert.match(source, /status:\s*"first_write"/);
    assert.match(source, /status:\s*"correction_honored"/);
    assert.match(source, /status:\s*"correction_visual_only"/);
  });
});
