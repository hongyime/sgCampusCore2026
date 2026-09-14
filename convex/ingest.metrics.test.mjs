import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const ingest = loadConvex("ingest.ts");
const metrics = loadConvex("lib/metrics.ts");
function fixture(lastVerified = Date.now()) {
  const database = memoryDatabase({
    users: [
      {
        _id: "member",
        _creationTime: 1,
        telegram_user_id: "synthetic-telegram",
        clerk_user_id: "synthetic-member",
        email: "synthetic@smu.edu.sg",
        last_verified_at: lastVerified,
      },
    ],
  });
  const scheduled = [];
  const ctx = {
    db: database.db,
    scheduler: { runAfter: async (...args) => scheduled.push(args) },
  };
  const create = (text = "Routine issue", user = "synthetic-telegram") =>
    database.atomic(() =>
      ingest.createTicket._handler(ctx, {
        telegram_user_id: user,
        text,
        headline: "Synthetic report",
        location_entity: "Test building",
        llm_severity_score: 10,
      }),
    );
  return { database, ctx, scheduled, create };
}

test("50-ticket registered ingestion burst preserves verification, priorities and the 60-second emergency schedule", async () => {
  const f = fixture();
  // Sequential transactions model a serialized burst here. Actual concurrent
  // OCC behavior must also be validated against an isolated Convex deployment.
  for (let i = 0; i < 50; i++) {
    const emergency = i % 10 === 0;
    const result = await f.create(
      emergency ? "emergency bleeding hazard" : `Routine issue ${i}`,
    );
    assert.equal(result.ok, true);
    assert.equal(result.priority_tier, emergency ? 1 : 2);
  }
  assert.equal(f.database.rows("tickets").length, 50);
  assert.equal(f.database.rows("telegram_egress_queue").length, 50);
  assert.equal(f.database.rows("metrics_receipts").length, 50);
  const { total } = await metrics.readMetricTotals(f.ctx);
  assert.equal(total.totalTickets, 50);
  assert.equal(total.resolvedCount, 0);
  assert.equal(total.sblCount, 0);
  assert.equal(f.scheduled.length, 5);
  for (const [delay, handler, args] of f.scheduled) {
    assert.equal(delay, 60_000);
    assert.equal(getFunctionName(handler), "sla:checkEmergencySla");
    const ticket = f.database
      .rows("tickets")
      .find((t) => t._id === args.ticket_id);
    assert.equal(ticket.priority_tier, 1);
    assert.equal(ticket.reporter_id, "synthetic-member");
  }
  assert.deepEqual(
    f.database.rows("metrics_control"),
    [],
    "Live writers do not contend on a global control row",
  );
});

test("unpaired and stale reports create no source, queue or metric rows", async () => {
  for (const [f, user, reason] of [
    [fixture(), "missing-user", "not_paired"],
    [
      fixture(Date.now() - 31 * 24 * 60 * 60 * 1000),
      "synthetic-telegram",
      "stale",
    ],
  ]) {
    const result = await f.create("emergency bleeding hazard", user);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    for (const table of [
      "tickets",
      "telegram_egress_queue",
      "metrics_receipts",
      "metrics_totals",
    ])
      assert.deepEqual(f.database.rows(table), []);
    assert.deepEqual(f.scheduled, []);
  }
});

test("a metric write failure rolls back ingestion before an emergency is scheduled", async () => {
  const f = fixture();
  f.database.failOnWrite(5);
  await assert.rejects(
    f.create("emergency bleeding hazard"),
    /Synthetic write failure/,
  );
  for (const table of [
    "tickets",
    "telegram_egress_queue",
    "metrics_receipts",
    "metrics_totals",
  ])
    assert.deepEqual(f.database.rows(table), []);
  assert.deepEqual(f.scheduled, []);
  assert.equal((await f.create()).ok, true);
  assert.equal((await metrics.readMetricTotals(f.ctx)).total.totalTickets, 1);
});
