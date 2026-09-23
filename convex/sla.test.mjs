// ci-verify: trigger build-check workflow to confirm new tests pass in CI
// Unit tests for the emergency SLA monitor (tech_design.md §7).
//
// Tests the checkEmergencySla internal mutation which:
//   1. Returns { breached: false } when the egress row has status "sent"
//   2. Creates a critical_escalation (reason "sla_breach") when not sent
//   3. Is idempotent: a second call for the same ticket does not duplicate
//   4. Schedules a Resend escalation email on breach
//   5. Handles missing egress rows gracefully
//
// Uses the same loadConvex() + memoryDatabase() pattern as the rest of the suite.
//
// Runnable with:  node --test convex/sla.test.mjs
// Or via:         npm run test:unit

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getFunctionName } from "convex/server";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));

const sla = loadConvex("sla.ts");

function fixture(egressStatus = "pending") {
  const database = memoryDatabase({
    tickets: [
      {
        _id: "ticket-1",
        _creationTime: 1,
        status: "open",
        priority_tier: 1,
        headline: "Emergency report",
        location_entity: "SIS Building",
        description: "Smoke in the hallway",
        created_at: 900_000,
        resolved_at: null,
        category: "Safety",
        triage_status: "locked",
        initial_tap_at: 900_000,
        image_status: "none",
      },
    ],
    telegram_egress_queue: [
      {
        _id: "egress-1",
        _creationTime: 1,
        ticket_id: "ticket-1",
        status: egressStatus,
        priority_tier: 1,
        claimed_at: null,
        retry_count: 0,
        created_at: 900_000,
        egress_cleared_at: egressStatus === "sent" ? 930_000 : null,
      },
    ],
  });
  const scheduled = [];
  const ctx = {
    db: database.db,
    scheduler: { runAfter: async (...args) => scheduled.push(args) },
  };
  const check = (ticketId = "ticket-1") =>
    database.atomic(() =>
      sla.checkEmergencySla._handler(ctx, { ticket_id: ticketId }),
    );
  return { database, ctx, scheduled, check };
}

// ---------------------------------------------------------------------------
// SLA met — egress already sent
// ---------------------------------------------------------------------------

describe("checkEmergencySla — SLA met", () => {
  it("returns { breached: false } when egress status is 'sent'", async () => {
    const f = fixture("sent");
    const result = plain(await f.check());
    assert.equal(result.breached, false);
    assert.deepEqual(f.database.rows("critical_escalations"), []);
    assert.deepEqual(f.scheduled, []);
  });
});

// ---------------------------------------------------------------------------
// SLA breached — egress not sent
// ---------------------------------------------------------------------------

describe("checkEmergencySla — SLA breached", () => {
  it("creates a critical_escalation with reason 'sla_breach' when egress is pending", async () => {
    const f = fixture("pending");
    const result = plain(await f.check());
    assert.equal(result.breached, true);
    assert.equal(result.alreadyRecorded, false);

    const escalations = f.database.rows("critical_escalations");
    assert.equal(escalations.length, 1);
    assert.equal(escalations[0].ticket_id, "ticket-1");
    assert.equal(escalations[0].reason, "sla_breach");
    assert.equal(typeof escalations[0].created_at, "number");
    assert.equal(escalations[0].acknowledged_at, null);
  });

  it("creates escalation when egress is 'processing' (not yet sent)", async () => {
    const f = fixture("processing");
    const result = plain(await f.check());
    assert.equal(result.breached, true);
    assert.equal(result.alreadyRecorded, false);
    assert.equal(f.database.rows("critical_escalations").length, 1);
  });

  it("creates escalation when egress is 'dead_letter'", async () => {
    const f = fixture("dead_letter");
    const result = plain(await f.check());
    assert.equal(result.breached, true);
    assert.equal(f.database.rows("critical_escalations").length, 1);
  });

  it("schedules a Resend escalation email on breach", async () => {
    const f = fixture("pending");
    await f.check();
    assert.equal(f.scheduled.length, 1);
    assert.equal(f.scheduled[0][0], 0); // runAfter(0, ...)
    assert.equal(
      getFunctionName(f.scheduled[0][1]),
      "lib/resend:sendEscalationEmail",
    );
    const emailArgs = f.scheduled[0][2];
    assert.equal(emailArgs.ticketId, "ticket-1");
    assert.equal(emailArgs.reason, "SLA Breach (60 seconds)");
    assert.equal(emailArgs.headline, "Emergency report");
    assert.equal(emailArgs.location_entity, "SIS Building");
  });
});

// ---------------------------------------------------------------------------
// Idempotency — duplicate calls
// ---------------------------------------------------------------------------

describe("checkEmergencySla — idempotency", () => {
  it("second call returns alreadyRecorded: true and does not create a duplicate escalation", async () => {
    const f = fixture("pending");

    const first = plain(await f.check());
    assert.equal(first.breached, true);
    assert.equal(first.alreadyRecorded, false);
    assert.equal(f.database.rows("critical_escalations").length, 1);

    const second = plain(await f.check());
    assert.equal(second.breached, true);
    assert.equal(second.alreadyRecorded, true);
    assert.equal(f.database.rows("critical_escalations").length, 1);
    // Second call should NOT schedule another email
    assert.equal(f.scheduled.length, 1);
  });

  it("does not duplicate when a dead_letter escalation already exists for the same ticket", async () => {
    const f = fixture("pending");
    // Pre-insert a dead_letter escalation (from queue.ts reaper)
    await f.database.db.insert("critical_escalations", {
      ticket_id: "ticket-1",
      reason: "dead_letter",
      created_at: 800_000,
    });

    // SLA check should still create its own sla_breach record (different reason)
    const result = plain(await f.check());
    assert.equal(result.breached, true);
    assert.equal(result.alreadyRecorded, false);
    assert.equal(f.database.rows("critical_escalations").length, 2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("checkEmergencySla — edge cases", () => {
  it("handles missing egress row (no queue entry for ticket) as a breach", async () => {
    const f = fixture("pending");
    // Remove the egress row
    const db = f.database;
    // Create a ticket with no egress row
    await db.db.insert("tickets", {
      status: "open",
      priority_tier: 1,
      headline: "Orphan ticket",
      location_entity: "Library",
      description: "No egress row",
      created_at: 800_000,
      resolved_at: null,
      category: null,
      triage_status: "awaiting_input",
      initial_tap_at: null,
      image_status: "none",
    });
    const orphanId = db.rows("tickets").at(-1)._id;
    const result = plain(
      await db.atomic(() =>
        sla.checkEmergencySla._handler(f.ctx, { ticket_id: orphanId }),
      ),
    );
    assert.equal(result.breached, true);
    assert.equal(result.alreadyRecorded, false);
  });

  it("is an internal mutation", () => {
    assert.equal(sla.checkEmergencySla.isInternal, true);
  });
});

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe("drift guard: sla.ts still exports checkEmergencySla with expected logic", () => {
  const source = readFileSync(resolve(__dirname, "sla.ts"), "utf8");

  it("exports checkEmergencySla as internalMutation", () => {
    assert.match(
      source,
      /export\s+const\s+checkEmergencySla\s*=\s*internalMutation/,
    );
  });

  it("checks egress status === 'sent' for SLA met", () => {
    assert.match(source, /egress\.status\s*===\s*"sent"/);
  });

  it("checks for existing sla_breach escalation (idempotency)", () => {
    assert.match(source, /reason\s*===\s*"sla_breach"/);
  });

  it("inserts critical_escalation with reason 'sla_breach'", () => {
    assert.match(source, /reason:\s*"sla_breach"/);
  });

  it("schedules Resend email via runAfter", () => {
    assert.match(source, /scheduler\.runAfter/);
    assert.match(source, /sendEscalationEmail/);
  });
});
