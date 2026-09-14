import assert from "node:assert/strict";
import test from "node:test";
import { getFunctionName } from "convex/server";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

async function fixture() {
  let now = 500_000_000;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const queue = loadConvex("queue.ts", { Date: Clock });
  const burst = loadConvex("burstTest.ts", { Date: Clock });
  const metrics = loadConvex("lib/metrics.ts");
  const database = memoryDatabase();
  const scheduled = [];
  const ctx = {
    db: database.db,
    scheduler: { runAfter: async (...args) => scheduled.push(args) },
  };
  await database.atomic(() => burst.seed50Tickets._handler(ctx, {}));
  const call = (name, args = {}) =>
    database.atomic(() => queue[name]._handler(ctx, args));
  const totals = () => metrics.readMetricTotals(ctx);
  return {
    database,
    ctx,
    scheduled,
    call,
    totals,
    advance: (ms) => (now += ms),
    now: () => now,
  };
}

test("registered 50-ticket queue burst preserves tier claims and counts each successful broadcast once", async () => {
  const f = await fixture();
  assert.equal((await f.totals()).total.totalTickets, 50);
  assert.equal(f.database.rows("metrics_receipts").length, 50);
  const emergency = await f.call("claimBatch", { limit: 1, priority_tier: 1 });
  const routine = await f.call("claimBatch", { limit: 25, priority_tier: 2 });
  assert.equal(emergency.length, 1);
  assert.equal(routine.length, 25);
  assert.ok(emergency.every((r) => r.priority_tier === 1));
  assert.ok(routine.every((r) => r.priority_tier === 2));
  f.advance(700);
  const results = [...emergency, ...routine].map((r) => ({
    id: r._id,
    success: true,
  }));
  await f.call("finalizeBatch", { results });
  const first = await f.totals();
  assert.equal(first.total.sblCount, 26);
  assert.equal(first.total.totalSblMs, 26 * 700);
  await f.call("finalizeBatch", { results });
  assert.deepEqual(await f.totals(), first);
  // Existing completion semantics update the timestamp on another success;
  // the metric changes its duration, not its count.
  f.advance(100);
  await f.call("finalizeBatch", { results: [results[0]] });
  assert.equal((await f.totals()).total.sblCount, 26);
  assert.equal((await f.totals()).total.totalSblMs, 26 * 700 + 100);
  assert.equal(
    f.database
      .rows("telegram_egress_queue")
      .filter((r) => r.status === "pending").length,
    24,
  );
  assert.deepEqual(f.scheduled, []);
});

test("a failed counter write rolls back the whole completion batch", async () => {
  const f = await fixture();
  const before = f.database.rows("telegram_egress_queue");
  const totals = await f.totals();
  f.database.failOnWrite(3);
  await assert.rejects(
    f.call("finalizeBatch", {
      results: before.slice(0, 3).map((r) => ({ id: r._id, success: true })),
    }),
    /Synthetic write failure/,
  );
  assert.deepEqual(f.database.rows("telegram_egress_queue"), before);
  assert.deepEqual(await f.totals(), totals);
});

test("retry and dead-letter thresholds retain existing behavior without counting failed broadcasts", async () => {
  const f = await fixture();
  const emergency = f.database
    .rows("telegram_egress_queue")
    .find((r) => r.priority_tier === 1);
  const results = [{ id: emergency._id, success: false }];
  for (let attempt = 1; attempt <= 3; attempt++) {
    await f.call("finalizeBatch", { results });
    const row = await f.database.db.get(emergency._id);
    assert.equal(row.retry_count, attempt);
    assert.equal(row.status, attempt < 3 ? "pending" : "dead_letter");
    assert.equal(row.egress_cleared_at, null);
    assert.equal((await f.totals()).total.sblCount, 0);
  }
  assert.equal(f.database.rows("critical_escalations").length, 1);
  assert.equal(
    f.database.rows("critical_escalations")[0].reason,
    "dead_letter",
  );
});

test("the reaper keeps its exact 10m30s boundary and emergency escalation schedule", async () => {
  const f = await fixture();
  const row = f.database
    .rows("telegram_egress_queue")
    .find((r) => r.priority_tier === 1);
  await f.database.db.patch(row._id, {
    status: "processing",
    claimed_at: f.now() - 630_000,
    retry_count: 2,
  });
  const before = await f.totals();
  await f.call("reapStaleProcessing");
  assert.equal((await f.database.db.get(row._id)).status, "processing");
  f.advance(1);
  await f.call("reapStaleProcessing");
  assert.equal((await f.database.db.get(row._id)).status, "dead_letter");
  assert.equal(f.scheduled.length, 1);
  assert.equal(f.scheduled[0][0], 0);
  assert.equal(
    getFunctionName(f.scheduled[0][1]),
    "lib/resend:sendEscalationEmail",
  );
  assert.deepEqual(await f.totals(), before);
});

test("an orphan egress completion retains its previous behavior and adds no ticket metrics", async () => {
  const f = await fixture();
  const id = await f.database.db.insert("telegram_egress_queue", {
    ticket_id: "missing-ticket",
    status: "pending",
    retry_count: 0,
    egress_cleared_at: null,
  });
  const before = await f.totals();
  await f.call("finalizeBatch", { results: [{ id, success: true }] });
  assert.equal((await f.database.db.get(id)).status, "sent");
  assert.deepEqual(await f.totals(), before);
});
