import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function ticketHandler() {
  const cache = new Map();
  function load(path) {
    const file = [path, `${path}.ts`, `${path}.js`].find(existsSync);
    assert.ok(file, `Missing module: ${path}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: file,
    });
    runInNewContext(
      outputText,
      {
        module: loaded,
        exports: loaded.exports,
        require: (name) =>
          name.startsWith(".")
            ? load(resolve(dirname(file), name))
            : require(name),
        process: { env: { CAMPUSCORE_SCHOOL_CODE: "smu" } },
      },
      { filename: file },
    );
    return loaded.exports;
  }
  return load(resolve(root, "convex/dashboard.ts")).getTickets._handler;
}

function ticket(index, status = "open") {
  return {
    _id: `ticket-${index}`,
    _creationTime: index,
    created_at: 10_000 - index, // Operational timestamps do not set list order.
    status,
    priority_tier: index % 2 ? 1 : 2,
    headline: "Synthetic public report",
    description: "Sanitized report text shown by the dashboard",
    location_entity: "Test building",
    category: index % 2 ? "Safety" : null,
    reporter_id: "synthetic-private-reporter",
    image_storage_id: "synthetic-private-storage",
    image_status: "removed",
    llm_severity_score: 0.123,
    triage_status: "locked",
    initial_tap_at: 123,
    resolved_at: status === "resolved" ? 20_000 : null,
    resolved_by: "synthetic-private-resolver",
    future_internal_metadata: { private: "synthetic-private-future-field" },
  };
}

// Model Convex's documented index range, creation-time ordering, and post-read
// filter semantics. Count examined documents independently of returned rows.
function context(rows, egressFor = () => ({ egress_cleared_at: 30_000 })) {
  const calls = {
    ticketsExamined: 0,
    ticketReads: 0,
    egressIds: [],
    writes: 0,
  };
  return {
    calls,
    ctx: {
      auth: { getUserIdentity: async () => null },
      db: {
        query(table) {
          if (table === "telegram_egress_queue") {
            let ticketId;
            return {
              withIndex(name, fn) {
                assert.equal(name, "by_ticket");
                fn({
                  eq(field, value) {
                    assert.equal(field, "ticket_id");
                    ticketId = value;
                  },
                });
                return this;
              },
              async unique() {
                calls.egressIds.push(ticketId);
                return egressFor(ticketId);
              },
            };
          }
          assert.equal(table, "tickets");
          let selected = [...rows];
          let predicate = () => true;
          return {
            withIndex(name, fn) {
              assert.equal(name, "by_status");
              fn({
                eq(field, value) {
                  assert.equal(field, "status");
                  selected = selected.filter((row) => row.status === value);
                },
              });
              return this;
            },
            order(direction) {
              assert.equal(direction, "desc");
              selected.sort((a, b) => b._creationTime - a._creationTime);
              return this;
            },
            filter(fn) {
              predicate = fn({
                field: (field) => (row) => row[field],
                eq: (field, value) => (row) => field(row) === value,
              });
              return this;
            },
            async take(limit) {
              calls.ticketReads++;
              const result = [];
              for (const row of selected) {
                calls.ticketsExamined++;
                if (predicate(row)) result.push(row);
                if (result.length === limit) break;
              }
              return result;
            },
          };
        },
        insert() {
          calls.writes++;
          assert.fail("A public list must not write");
        },
        patch() {
          calls.writes++;
          assert.fail("A public list must not write");
        },
      },
    },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("anonymous list preserves displayed fields and excludes private or future metadata", async () => {
  const rows = [ticket(1)];
  const snapshot = structuredClone(rows);
  const { ctx, calls } = context(rows);
  const result = plain(await ticketHandler()(ctx, {}));
  assert.equal(result.length, 1);
  const expected = {
    _id: rows[0]._id,
    status: rows[0].status,
    priority_tier: rows[0].priority_tier,
    headline: rows[0].headline,
    description: rows[0].description,
    location_entity: rows[0].location_entity,
    category: rows[0].category,
    created_at: rows[0].created_at,
    egress_cleared_at: 30_000,
  };
  assert.deepEqual(result[0], expected);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private/);
  assert.deepEqual(rows, snapshot);
  assert.equal(calls.writes, 0);
});

for (const status of ["open", "resolved"]) {
  test(`${status} filter examines at most 50 matching rows despite 6000 newer unrelated tickets`, async () => {
    const other = status === "open" ? "resolved" : "open";
    const rows = Array.from({ length: 80 }, (_, index) =>
      ticket(index, status),
    );
    rows.push(
      ...Array.from({ length: 6000 }, (_, index) => ticket(index + 100, other)),
    );
    const { ctx, calls } = context(rows);
    const result = plain(await ticketHandler()(ctx, { status }));
    assert.deepEqual(
      result.map((row) => row._id),
      rows
        .slice(0, 80)
        .reverse()
        .slice(0, 50)
        .map((row) => row._id),
    );
    assert.ok(result.every((row) => row.status === status));
    assert.equal(calls.ticketReads, 1);
    assert.ok(
      calls.ticketsExamined <= 50,
      `${calls.ticketsExamined} documents examined`,
    );
    assert.deepEqual(
      calls.egressIds,
      result.map((row) => row._id),
    );
    assert.equal(calls.writes, 0);
  });
}

test("unfiltered list retains both states and the original newest-50 creation order", async () => {
  const rows = Array.from({ length: 120 }, (_, index) =>
    ticket(index, index % 2 ? "open" : "resolved"),
  );
  const { ctx, calls } = context(rows);
  const result = plain(await ticketHandler()(ctx, {}));
  assert.deepEqual(
    result.map((row) => row._id),
    [...rows]
      .reverse()
      .slice(0, 50)
      .map((row) => row._id),
  );
  assert.equal(calls.ticketsExamined, 50);
  assert.equal(calls.egressIds.length, 50);
});

test("missing egress stays null and a recorded zero timestamp is retained", async () => {
  const { ctx } = context([ticket(1), ticket(2), ticket(3)], (id) =>
    id === "ticket-1"
      ? null
      : { egress_cleared_at: id === "ticket-2" ? null : 0 },
  );
  const result = plain(await ticketHandler()(ctx, {}));
  assert.deepEqual(
    result.map((row) => row.egress_cleared_at),
    [0, null, null],
  );
});

test("empty result makes no egress lookups and preserves its public read-only behavior", async () => {
  const { ctx, calls } = context([]);
  assert.deepEqual(plain(await ticketHandler()(ctx, { status: "open" })), []);
  assert.deepEqual(calls.egressIds, []);
  assert.equal(calls.writes, 0);
});
