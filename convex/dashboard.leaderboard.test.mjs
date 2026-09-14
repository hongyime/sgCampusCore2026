import assert from "node:assert/strict";
import test from "node:test";
import {
  loadConvex,
  memoryDatabase,
} from "../config/testing/convex-fixture.mjs";

const dashboard = loadConvex("dashboard.ts");
const maintenance = loadConvex("leaderboardMaintenance.ts");
const member = {
  subject: "user-new",
  email: "student@smu.edu.sg",
  emailVerified: true,
};
const resolution = (i, resolver = `user-${i % 13}`) => ({
  _id: `resolution-${i}`,
  _creationTime: i + 1,
  ticket_id: `ticket-${i}`,
  resolver_id: resolver,
  resolved_at: 5000 + i,
});
function fixture(source = []) {
  const database = memoryDatabase({
    resolutions: source,
    tickets: [
      {
        _id: "open-ticket",
        _creationTime: 0,
        status: "open",
        priority_tier: 1,
        created_at: 0,
        resolved_at: null,
        location_entity: "Test location",
      },
    ],
  });
  const ctx = {
    db: database.db,
    auth: { getUserIdentity: async () => member },
  };
  const call = (name, args = {}) =>
    database.atomic(() => maintenance[name]._handler(ctx, args));
  const resolve = () =>
    database.atomic(() =>
      dashboard.resolveTicket._handler(ctx, {
        ticketId: "open-ticket",
        userId: "forged-user",
      }),
    );
  return { database, ctx, call, resolve };
}
function expected(source) {
  const totals = new Map();
  for (const row of source) {
    const value = totals.get(row.resolver_id) ?? {
      userId: row.resolver_id,
      count: 0,
      first: Infinity,
    };
    value.count++;
    value.first = Math.min(value.first, row._creationTime);
    totals.set(value.userId, value);
  }
  return [...totals.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.first - b.first ||
        a.userId.localeCompare(b.userId),
    )
    .slice(0, 10)
    .map(({ userId, count }) => ({ userId, count }));
}
const plain = (value) => JSON.parse(JSON.stringify(value));
async function finish(f) {
  let calls = 0;
  while (!(await f.call("backfillPage")).done) assert.ok(++calls < 100);
  return f.call("inspect");
}

test("maintenance handlers are internal only", () => {
  for (const handler of Object.values(maintenance))
    assert.equal(handler.isInternal, true);
});

for (const size of [0, 1, 24, 25, 26, 251, 1200]) {
  test(`full retained history is counted exactly once across bounded pages: ${size}`, async () => {
    const source = Array.from({ length: size }, (_, i) => resolution(i));
    const f = fixture(source);
    const result = await finish(f);
    assert.equal(result.control.total, size);
    assert.equal(result.control.enabled, false);
    assert.deepEqual(plain(result.top), expected(source));
    assert.equal(f.database.rows("resolutions").length, size);
    for (const row of f.database.rows("resolutions")) {
      const { leaderboard_counted, ...original } = row;
      assert.equal(leaderboard_counted, true);
      assert.deepEqual(
        original,
        source.find((value) => value._id === row._id),
      );
    }
    assert.ok(
      f.database.reads
        .filter((r) => r.operation === "paginate")
        .every((r) => r.count <= 25 && r.bytes <= 250_000),
    );
    await f.call("startBackfill");
    const repeated = await finish(f);
    assert.equal(repeated.control.total, size);
    assert.deepEqual(plain(repeated.top), expected(source));
  });
}

test("resolutions interleaved before, during and after backfill remain exact", async () => {
  for (const phase of ["before", "during", "after"]) {
    const f = fixture(
      Array.from({ length: 73 }, (_, i) =>
        resolution(i, i % 2 ? "user-new" : "user-old"),
      ),
    );
    if (phase === "before") await f.resolve();
    await f.call("backfillPage");
    if (phase === "during") await f.resolve();
    await finish(f);
    if (phase === "after") await f.resolve();
    const snapshot = await f.call("inspect");
    assert.equal(snapshot.control.total, 74);
    assert.deepEqual(
      plain(snapshot.top),
      expected(f.database.rows("resolutions")),
    );
    assert.equal(
      f.database
        .rows("resolutions")
        .filter((row) => row.resolver_id === "forged-user").length,
      0,
    );
    await assert.rejects(f.resolve(), /already been resolved/);
    assert.equal((await f.call("inspect")).control.total, 74);
  }
});

test("an interrupted page rolls back receipts and totals and can resume", async () => {
  const source = Array.from({ length: 51 }, (_, i) => resolution(i));
  const f = fixture(source);
  await f.call("backfillPage");
  const before = plain(await f.call("inspect"));
  f.database.failOnWrite(5);
  await assert.rejects(f.call("backfillPage"), /Synthetic write failure/);
  assert.deepEqual(plain(await f.call("inspect")), before);
  assert.equal((await finish(f)).control.total, source.length);
});

test("counter failure also rolls back the application resolution", async () => {
  const f = fixture();
  f.database.failOnWrite(4);
  await assert.rejects(f.resolve(), /Synthetic write failure/);
  assert.equal(f.database.rows("tickets")[0].status, "open");
  assert.deepEqual(f.database.rows("resolutions"), []);
  await f.resolve();
  assert.equal((await f.call("inspect")).control.total, 1);
});

test("activation rejects missing, incomplete and stale validation", async () => {
  const f = fixture(Array.from({ length: 26 }, (_, i) => resolution(i)));
  await assert.rejects(
    f.call("setEnabled", { enabled: true, expectedTotal: 0 }),
  );
  await f.call("backfillPage");
  await assert.rejects(
    f.call("setEnabled", { enabled: true, expectedTotal: 25 }),
  );
  await finish(f);
  await f.resolve();
  await assert.rejects(
    f.call("setEnabled", { enabled: true, expectedTotal: 26 }),
  );
  await f.call("setEnabled", { enabled: true, expectedTotal: 27 });
  assert.equal((await f.call("inspect")).control.enabled, true);
});

test("enabled public query reads at most eleven aggregate rows and no source history", async () => {
  const source = Array.from({ length: 1200 }, (_, i) => resolution(i));
  const f = fixture(source);
  await finish(f);
  await f.call("setEnabled", { enabled: true, expectedTotal: source.length });
  f.database.reads.length = 0;
  assert.deepEqual(
    plain(await dashboard.getLeaderboard._handler(f.ctx, {})),
    expected(source),
  );
  assert.ok(
    f.database.reads.every((read) =>
      ["leaderboard_control", "leaderboard_totals"].includes(read.table),
    ),
  );
  assert.equal(
    f.database.reads.reduce((sum, read) => sum + read.count, 0),
    11,
  );
  assert.equal(
    f.database.reads.find((read) => read.operation === "take").limit,
    10,
  );
});

test("disabled reader preserves complete historical counts while a backfill is partial", async () => {
  const source = Array.from({ length: 53 }, (_, i) => resolution(i));
  const f = fixture(source);
  await f.call("backfillPage");
  assert.deepEqual(
    plain(await dashboard.getLeaderboard._handler(f.ctx, {})),
    expected(source),
  );
  await finish(f);
  await f.call("setEnabled", { enabled: true, expectedTotal: 53 });
  await f.call("setEnabled", { enabled: false, expectedTotal: 0 });
  await f.resolve();
  assert.equal((await f.call("inspect")).control.total, 54);
});

test("backfill preserves deterministic tied rankings and arbitrary retained resolver keys", async () => {
  const source = [
    resolution(5, "user-later"),
    resolution(2, "__proto__"),
    resolution(1, "user-earlier"),
    resolution(4, "constructor"),
  ];
  const f = fixture(source);
  assert.deepEqual(plain((await finish(f)).top), expected(source));
});

test("verification pages remain bounded and include every original field", async () => {
  const source = Array.from({ length: 251 }, (_, i) => resolution(i));
  const f = fixture(source);
  let cursor = null;
  const found = [];
  for (;;) {
    const result = await f.call("verificationPage", {
      table: "resolutions",
      cursor,
    });
    assert.ok(result.page.length <= 100);
    found.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  assert.deepEqual(plain(found), source);
});

test("oversized source pages stop without advancing or discarding records", async () => {
  const source = [resolution(1, "x".repeat(300_000))];
  const f = fixture(source);
  await assert.rejects(f.call("backfillPage"), /cursor did not advance/);
  assert.deepEqual(f.database.rows("resolutions"), source);
  assert.equal((await f.call("inspect")).control, null);
});

test("restart repairs records from a previous writer without resetting retained counts", async () => {
  const f = fixture([resolution(1)]);
  await finish(f);
  await f.call("setEnabled", { enabled: true, expectedTotal: 1 });
  await f.database.db.insert("resolutions", {
    ticket_id: "older-writer-ticket",
    resolver_id: "user-recovered",
    resolved_at: 9876,
  });
  await f.call("startBackfill");
  assert.equal((await f.call("inspect")).control.enabled, false);
  const result = await finish(f);
  assert.equal(result.control.total, 2);
  assert.deepEqual(plain(result.top), expected(f.database.rows("resolutions")));
});
