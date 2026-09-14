import assert from "node:assert/strict";
import test from "node:test";
import { convexToJson } from "convex/values";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const dashboard = loadConvex("dashboard.ts");
const maintenance = loadConvex("metricsMaintenance.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture(count = 61, names) {
  const tickets = Array.from({ length: count }, (_, i) => ({
    _id: `ticket-${i}`,
    _creationTime: i + 1,
    created_at: 1000,
    resolved_at: i % 2 ? null : 3000,
    status: i % 2 ? "open" : "resolved",
    priority_tier: 2,
    location_entity: names?.[i] ?? `Place ${i}`,
    category: null,
    triage_status: "awaiting_input",
    initial_tap_at: null,
    headline: "Report",
    description: "PRIVATE ORIGINAL TEXT",
    reporter_id: "PRIVATE REPORTER",
    image_status: "none",
  }));
  const database = memoryDatabase({
    tickets,
    telegram_egress_queue: tickets.map((t, i) => ({
      _id: `queue-${i}`,
      _creationTime: i + 1,
      ticket_id: t._id,
      egress_cleared_at: 1200,
      status: "sent",
      priority_tier: 2,
      created_at: 1000,
      claimed_at: null,
      retry_count: 0,
    })),
  });
  const ctx = {
    db: database.db,
    auth: {
      getUserIdentity: async () => ({
        subject: "actual-member",
        email: "member@smu.edu.sg",
        emailVerified: true,
      }),
    },
  };
  const call = (name, args = {}) =>
    database.atomic(() => maintenance[name]._handler(ctx, args));
  const read = (locationCursor = null) =>
    dashboard.getMetrics._handler(ctx, { locationCursor });
  const resolve = () =>
    database.atomic(() =>
      dashboard.resolveTicket._handler(ctx, {
        ticketId: "ticket-1",
        userId: "forged-member",
      }),
    );
  return { database, ctx, call, read, resolve };
}
async function enable(f) {
  let pages = 0;
  while (!(await f.call("backfillPage")).done) assert.ok(++pages < 1000);
  const { revisions } = await f.call("inspect");
  await f.call("setEnabled", { enabled: true, expectedRevisions: revisions });
}
async function pages(f) {
  let cursor = null;
  const results = [];
  do {
    const result = await f.read(cursor);
    results.push(plain(result));
    cursor = result.nextLocationCursor;
    assert.ok(results.length < 1000);
  } while (cursor !== null);
  return results;
}

for (const enabled of [false, true]) {
  test(`all location pages preserve global full-history metrics, derived=${enabled}`, async () => {
    const f = fixture();
    if (enabled) await enable(f);
    const results = await pages(f);
    assert.deepEqual(
      results.map((r) => r.locations.length),
      [25, 25, 11],
    );
    assert.equal(
      new Set(results.flatMap((r) => r.locations.map((l) => l.location))).size,
      61,
    );
    for (const result of results) {
      assert.equal(result.totalTickets, 61);
      assert.equal(result.resolvedCount, 31);
      assert.equal(result.avgTtrMs, 2000);
      assert.equal(result.avgSblMs, 200);
      assert.equal(result.locationPageReset, false);
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false);
      assert.doesNotThrow(() => convexToJson(result));
    }
  });
}

test("activated public metrics have bounded reads even when a caller sends an old fallback cursor", async () => {
  const f = fixture(251);
  await enable(f);
  f.database.reads.length = 0;
  const result = await f.read("history:100");
  assert.equal(result.totalTickets, 251);
  assert.equal(result.locationPageReset, true);
  assert.equal(result.locations.length, 25);
  assert.ok(result.nextLocationCursor.startsWith("metrics-v1:"));
  assert.ok(f.database.reads.every((r) => r.table?.startsWith("metrics_")));
  assert.ok(f.database.reads.every((r) => r.operation !== "collect"));
  assert.ok(f.database.reads.reduce((sum, r) => sum + r.count, 0) <= 442);
});

test("Unicode, reserved object keys and zero timestamps survive the actual Convex response codec", async () => {
  const names = ["__proto__", "$atrium", "中文 🦐", "constructor"];
  const f = fixture(names.length, names);
  for (const t of f.database.rows("tickets"))
    await f.database.db.patch(t._id, {
      created_at: 0,
      resolved_at: 0,
      status: "resolved",
    });
  for (const q of f.database.rows("telegram_egress_queue"))
    await f.database.db.patch(q._id, { egress_cleared_at: 0 });
  for (const derived of [false, true]) {
    if (derived) await enable(f);
    const result = plain(await f.read());
    assert.deepEqual(
      result.locations.map((r) => r.location),
      names,
    );
    assert.equal(result.resolvedCount, 4);
    assert.equal(result.avgTtrMs, 0);
    assert.equal(result.avgSblMs, 0);
    assert.doesNotThrow(() => convexToJson(result));
    assert.deepEqual(Object.keys(result.locationBreakdown), ["constructor"]);
  }
});

test("activation and rollback reset incompatible page cursors without losing metric totals", async () => {
  const f = fixture();
  const original = await f.read();
  await enable(f);
  const enabled = await f.read(original.nextLocationCursor);
  assert.equal(enabled.locationPageReset, true);
  assert.equal(enabled.locations[0].location, original.locations[0].location);
  await f.call("setEnabled", { enabled: false, expectedRevisions: [] });
  const fallback = await f.read(enabled.nextLocationCursor);
  assert.equal(fallback.locationPageReset, true);
  assert.equal(fallback.locations[0].location, original.locations[0].location);
  assert.equal(fallback.totalTickets, enabled.totalTickets);
});

test("resolution updates metrics and leaderboard with authenticated attribution in one transaction", async () => {
  const f = fixture(2);
  await enable(f);
  await f.resolve();
  const result = await f.read();
  assert.equal(result.totalTickets, 2);
  assert.equal(result.resolvedCount, 2);
  const tickets = f.database.rows("tickets");
  assert.equal(
    result.avgTtrMs,
    tickets.reduce((sum, t) => sum + t.resolved_at - t.created_at, 0) / 2,
  );
  assert.ok(result.locations.every((l) => l.open === 0));
  assert.equal(f.database.rows("resolutions")[0].resolver_id, "actual-member");
  assert.equal(f.database.rows("leaderboard_totals")[0].count, 1);
  await assert.rejects(f.resolve(), /already been resolved/);
  assert.deepEqual(plain(await f.read()), plain(result));
});

test("metric failure rolls back the source resolution and its leaderboard receipt", async () => {
  const f = fixture(2);
  const before = f.database.rows("tickets");
  f.database.failOnWrite(7);
  await assert.rejects(f.resolve(), /Synthetic write failure/);
  assert.deepEqual(f.database.rows("tickets"), before);
  for (const table of [
    "resolutions",
    "leaderboard_totals",
    "metrics_receipts",
    "metrics_totals",
  ])
    assert.deepEqual(f.database.rows(table), []);
  await f.resolve();
  assert.equal(f.database.rows("resolutions").length, 1);
});

test("backfill after an older writer changes a duration reconciles without resetting source data", async () => {
  const f = fixture(2);
  await enable(f);
  await f.database.db.patch("queue-1", { egress_cleared_at: 1800 });
  await f.call("startBackfill");
  assert.equal((await f.read()).avgSblMs, 500);
  await enable(f);
  assert.equal((await f.read()).avgSblMs, 500);
  assert.equal((await f.read()).totalTickets, 2);
});
