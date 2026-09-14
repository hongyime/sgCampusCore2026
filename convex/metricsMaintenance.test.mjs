import assert from "node:assert/strict";
import test from "node:test";
import { convexToJson } from "convex/values";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const maintenance = loadConvex("metricsMaintenance.ts");
const metrics = loadConvex("lib/metrics.ts");
const values = loadConvex("lib/metricValues.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const ticket = (i, location = `Building ${i % 40}`) => ({
  _id: `ticket-${i}`,
  _creationTime: i + 1,
  created_at: 1000 + i,
  resolved_at: i % 3 ? null : 6000 + i,
  status: i % 3 ? "open" : "resolved",
  location_entity: location,
  category: null,
  priority_tier: 2,
  triage_status: "awaiting_input",
  initial_tap_at: null,
  headline: "Retained headline",
  description: "Retained private source content",
  image_status: "none",
  reporter_id: `private-reporter-${i}`,
});
const egress = (t, i) => ({
  _id: `egress-${i}`,
  _creationTime: i + 1,
  ticket_id: t._id,
  status: i % 2 ? "pending" : "sent",
  priority_tier: 2,
  created_at: t.created_at,
  claimed_at: null,
  retry_count: 0,
  egress_cleared_at: i % 2 ? null : t.created_at + 300,
});
function fixture(tickets) {
  const database = memoryDatabase({
    tickets,
    telegram_egress_queue: tickets.map(egress),
  });
  const ctx = { db: database.db };
  const call = (name, args = {}) =>
    database.atomic(() => maintenance[name]._handler(ctx, args));
  const refresh = (id) =>
    database.atomic(() => metrics.refreshTicketMetrics(ctx, id));
  return { database, ctx, call, refresh };
}
async function finish(f) {
  let count = 0;
  while (!(await f.call("backfillPage")).done) assert.ok(++count < 1000);
  return plain(await f.call("inspect"));
}
function expected(f) {
  const result = {
    totalTickets: 0,
    resolvedCount: 0,
    totalTtrMs: 0,
    sblCount: 0,
    totalSblMs: 0,
  };
  const locations = new Map();
  const queued = new Map(
    f.database.rows("telegram_egress_queue").map((q) => [q.ticket_id, q]),
  );
  for (const t of f.database.rows("tickets")) {
    result.totalTickets++;
    const name = t.location_entity || "Unknown";
    const loc = locations.get(name) ?? { location: name, total: 0, open: 0 };
    loc.total++;
    if (t.status === "open") loc.open++;
    locations.set(name, loc);
    if (t.status === "resolved" && t.resolved_at !== null) {
      result.resolvedCount++;
      result.totalTtrMs += t.resolved_at - t.created_at;
    }
    const q = queued.get(t._id);
    if (q?.egress_cleared_at != null) {
      result.sblCount++;
      result.totalSblMs += q.egress_cleared_at - t.created_at;
    }
  }
  return {
    total: result,
    locations: [...locations.values()].sort((a, b) =>
      a.location.localeCompare(b.location),
    ),
  };
}
async function allLocations(f) {
  let cursor = null;
  const rows = [];
  do {
    const page = await metrics.readLocationPage(f.ctx, cursor);
    rows.push(...plain(page.locations));
    cursor = page.nextLocationCursor;
  } while (cursor !== null);
  return rows.sort((a, b) => a.location.localeCompare(b.location));
}

test("all maintenance endpoints are internal", () => {
  for (const handler of Object.values(maintenance))
    assert.equal(handler.isInternal, true);
});

for (const size of [0, 1, 24, 25, 26, 251, 1200]) {
  test(`all retained metric sources survive bounded and repeated backfill: ${size}`, async () => {
    const source = Array.from({ length: size }, (_, i) => ticket(i));
    const f = fixture(source);
    const queue = f.database.rows("telegram_egress_queue");
    const first = await finish(f);
    assert.equal(first.control.enabled, false);
    assert.deepEqual(first.total, expected(f).total);
    assert.deepEqual(await allLocations(f), expected(f).locations);
    assert.equal(f.database.rows("metrics_receipts").length, size);
    assert.deepEqual(f.database.rows("tickets"), source);
    assert.deepEqual(f.database.rows("telegram_egress_queue"), queue);
    assert.ok(
      f.database.reads
        .filter((r) => r.table === "tickets" && r.operation === "paginate")
        .every((r) => r.count <= 25 && r.bytes <= 250_000),
    );
    await f.call("startBackfill");
    const repeated = await finish(f);
    assert.deepEqual(repeated.total, first.total);
    assert.deepEqual(repeated.revisions, first.revisions);
  });
}

test("updates before, during and after backfill change each contribution exactly once", async () => {
  for (const phase of ["before", "during", "after"]) {
    const f = fixture(Array.from({ length: 73 }, (_, i) => ticket(i)));
    async function update() {
      await f.database.atomic(async () => {
        await f.database.db.patch("ticket-1", {
          status: "resolved",
          resolved_at: 9999,
          location_entity: "New building",
        });
        await f.database.db.patch("egress-1", {
          status: "sent",
          egress_cleared_at: 8888,
        });
        await metrics.refreshTicketMetrics(f.ctx, "ticket-1");
      });
    }
    if (phase === "before") await update();
    await f.call("backfillPage");
    if (phase === "during") await update();
    await finish(f);
    if (phase === "after") await update();
    const beforeRetry = plain(await f.call("inspect"));
    assert.deepEqual(beforeRetry.total, expected(f).total);
    assert.deepEqual(await allLocations(f), expected(f).locations);
    assert.equal(await f.refresh("ticket-1"), false);
    assert.deepEqual(plain(await f.call("inspect")), beforeRetry);
  }
});

test("source and counter failure roll back together, and the same operation can retry", async () => {
  const f = fixture([ticket(1)]);
  const before = f.database.rows("tickets");
  f.database.failOnWrite(5);
  await assert.rejects(
    f.database.atomic(async () => {
      await f.database.db.patch("ticket-1", {
        status: "resolved",
        resolved_at: 9999,
      });
      await metrics.refreshTicketMetrics(f.ctx, "ticket-1");
    }),
    /Synthetic write failure/,
  );
  assert.deepEqual(f.database.rows("tickets"), before);
  assert.deepEqual(f.database.rows("metrics_totals"), []);
  assert.deepEqual(f.database.rows("metrics_receipts"), []);
  assert.deepEqual((await finish(f)).total, expected(f).total);
});

test("a failed backfill page leaves its cursor and previously retained contributions intact", async () => {
  const f = fixture(Array.from({ length: 60 }, (_, i) => ticket(i)));
  await f.call("backfillPage");
  const before = plain(await f.call("inspect"));
  f.database.failOnWrite(7);
  await assert.rejects(f.call("backfillPage"), /Synthetic write failure/);
  assert.deepEqual(plain(await f.call("inspect")), before);
  assert.deepEqual((await finish(f)).total, expected(f).total);
});

test("activation rejects incomplete or concurrently changed totals, including updates with unchanged ticket count", async () => {
  const f = fixture(Array.from({ length: 26 }, (_, i) => ticket(i)));
  await assert.rejects(
    f.call("setEnabled", {
      enabled: true,
      expectedRevisions: Array(16).fill(0),
    }),
  );
  await f.call("backfillPage");
  let view = plain(await f.call("inspect"));
  await assert.rejects(
    f.call("setEnabled", { enabled: true, expectedRevisions: view.revisions }),
  );
  view = await finish(f);
  await f.database.db.patch("egress-1", {
    egress_cleared_at: 8000,
    status: "sent",
  });
  await f.refresh("ticket-1");
  await assert.rejects(
    f.call("setEnabled", { enabled: true, expectedRevisions: view.revisions }),
  );
  view = plain(await f.call("inspect"));
  await f.call("setEnabled", {
    enabled: true,
    expectedRevisions: view.revisions,
  });
  assert.equal((await f.call("inspect")).control.enabled, true);
  await f.call("setEnabled", { enabled: false, expectedRevisions: [] });
  assert.equal((await f.call("inspect")).control.enabled, false);
});

test("one metric page has bounded aggregate reads and no ticket or queue scan", async () => {
  const f = fixture(Array.from({ length: 1200 }, (_, i) => ticket(i)));
  await finish(f);
  f.database.reads.length = 0;
  await metrics.metricsControl(f.ctx);
  await metrics.readMetricTotals(f.ctx);
  const first = await metrics.readLocationPage(f.ctx, null);
  assert.equal(first.locations.length, 25);
  assert.ok(first.nextLocationCursor);
  assert.ok(f.database.reads.every((r) => r.table?.startsWith("metrics_")));
  assert.ok(f.database.reads.reduce((sum, r) => sum + r.count, 0) <= 442);
  assert.ok(f.database.reads.every((r) => r.operation !== "collect"));
  assert.deepEqual(await allLocations(f), expected(f).locations);
});

test("zero timestamps, negative durations and arbitrary location strings retain their values", async () => {
  const locations = [
    "__proto__",
    "constructor",
    "$atrium",
    "中文 🦐",
    "",
    "Unknown",
  ];
  const f = fixture(
    locations.map((location, i) => ({
      ...ticket(i, location),
      created_at: 100,
      status: "resolved",
      resolved_at: 0,
    })),
  );
  for (const row of f.database.rows("telegram_egress_queue"))
    await f.database.db.patch(row._id, { egress_cleared_at: 0 });
  const view = await finish(f);
  assert.equal(view.total.resolvedCount, 6);
  assert.equal(view.total.totalTtrMs, -600);
  assert.equal(view.total.sblCount, 6);
  assert.equal(view.total.totalSblMs, -600);
  const rows = await allLocations(f);
  assert.deepEqual(rows, expected(f).locations);
  assert.doesNotThrow(() => convexToJson(rows));
});

test("oversized or invalid retained data stops backfill without discarding source records", async () => {
  for (const source of [
    ticket(1, "x".repeat(300_000)),
    { ...ticket(1), created_at: NaN },
  ]) {
    const f = fixture([source]);
    await assert.rejects(
      f.call("backfillPage"),
      /cursor did not advance|Invalid retained metric timestamp/,
    );
    assert.deepEqual(f.database.rows("tickets"), [source]);
    assert.deepEqual(f.database.rows("metrics_receipts"), []);
  }
});

test("duplicate or invalid shard rows are detected rather than silently capped", async () => {
  const f = fixture([]);
  await f.database.db.insert("metrics_totals", {
    ...values.emptyMetrics(),
    shard: 0,
    revision: 1,
  });
  await f.database.db.insert("metrics_totals", {
    ...values.emptyMetrics(),
    shard: 0,
    revision: 2,
  });
  await assert.rejects(
    metrics.readMetricTotals(f.ctx),
    /Invalid metric shards/,
  );
});
