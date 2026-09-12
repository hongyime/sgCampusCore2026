import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Execute the actual registered Convex handlers and school predicates. Only
// database/auth services and process.env are synthetic; no network or live data.
function handlers(env = {}) {
  const cache = new Map();
  function load(path) {
    const file = [path, `${path}.ts`, `${path}.js`].find(existsSync);
    assert.ok(file, `Missing module: ${path}`);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
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
        module: loadedModule,
        exports: loadedModule.exports,
        require: (name) =>
          name.startsWith(".")
            ? load(resolve(dirname(file), name))
            : require(name),
        process: {
          env: {
            CAMPUSCORE_SCHOOL_CODE: "smu",
            CAMPUSCORE_ADMIN_ALLOWLIST: "admin@smu.edu.sg",
            ...env,
          },
        },
      },
      { filename: file },
    );
    return loadedModule.exports;
  }
  return {
    ...load(resolve(root, "convex/dashboard.ts")),
    ...load(resolve(root, "convex/escalations.ts")),
  };
}

const member = {
  subject: "synthetic-member",
  email: "member@smu.edu.sg",
  emailVerified: true,
};
const admin = {
  ...member,
  subject: "synthetic-admin",
  email: "admin@smu.edu.sg",
};
const ticketId = "synthetic-ticket";
const escalationId = "synthetic-escalation";

function context(identity = null, acknowledgedAt = null) {
  const rows = new Map([
    [
      ticketId,
      {
        _id: ticketId,
        status: "open",
        priority_tier: 1,
        headline: "Synthetic report",
        location_entity: "Test location",
      },
    ],
    [
      escalationId,
      {
        _id: escalationId,
        ticket_id: ticketId,
        acknowledged_at: acknowledgedAt,
      },
    ],
  ]);
  const events = [];
  const access = [];
  const ctx = {
    auth: { getUserIdentity: async () => identity },
    db: {
      get: async (id) => {
        access.push("get");
        return rows.get(id) ?? null;
      },
      patch: async (id, patch) => {
        access.push("patch");
        Object.assign(rows.get(id), patch);
      },
      insert: async (table, row) => {
        access.push("insert");
        events.push({ table, ...row });
      },
      query: (table) => {
        access.push("query");
        assert.equal(table, "critical_escalations");
        return {
          filter: (fn) => {
            const predicate = fn({
              field: (field) => (row) => row[field],
              eq: (field, value) => (row) => field(row) === value,
            });
            return {
              collect: async () => [rows.get(escalationId)].filter(predicate),
            };
          },
        };
      },
    },
  };
  return { ctx, rows, events, access };
}

const deniedMembers = [
  ["anonymous", null],
  ["another institution", { ...member, email: "member@nus.edu.sg" }],
  ["missing email", { subject: member.subject }],
  ["explicitly unverified email", { ...member, emailVerified: false }],
];

for (const [name, identity] of deniedMembers) {
  test(`resolution rejects ${name} before database access`, async () => {
    const { ctx, rows, events, access } = context(identity);
    await assert.rejects(
      handlers().resolveTicket._handler(ctx, {
        ticketId,
        userId: "forged-resolver",
      }),
    );
    assert.deepEqual(access, []);
    assert.equal(rows.get(ticketId).status, "open");
    assert.deepEqual(events, []);
  });
}

for (const email of ["member@smu.edu.sg", "  MEMBER@SMU.EDU.SG  "]) {
  test(`school member resolution uses signed subject: ${email}`, async () => {
    const { ctx, rows, events } = context({ ...member, email });
    await handlers().resolveTicket._handler(ctx, {
      ticketId,
      userId: "forged-resolver",
    });
    assert.equal(rows.get(ticketId).status, "resolved");
    assert.equal(rows.get(ticketId).priority_tier, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].resolver_id, member.subject);
    assert.equal(events[0].resolved_at, rows.get(ticketId).resolved_at);
  });
}

test("resolution accepts the current client without a resolver argument", async () => {
  const { ctx, events } = context(member);
  await handlers().resolveTicket._handler(ctx, { ticketId });
  assert.equal(events[0].resolver_id, member.subject);
});

test("missing and already resolved tickets create no additional records", async () => {
  const api = handlers();
  const { ctx, rows, events } = context(member);
  await assert.rejects(
    api.resolveTicket._handler(ctx, { ticketId: "missing" }),
  );
  await api.resolveTicket._handler(ctx, { ticketId });
  const resolvedAt = rows.get(ticketId).resolved_at;
  await assert.rejects(api.resolveTicket._handler(ctx, { ticketId }));
  assert.equal(rows.get(ticketId).resolved_at, resolvedAt);
  assert.equal(events.length, 1);
});

const deniedAdmins = [
  ...deniedMembers,
  ["staff absent from allowlist", member],
  [
    "allowlisted address outside this school",
    { ...member, email: "student@scis.smu.edu.sg" },
  ],
];
for (const [name, identity] of deniedAdmins) {
  test(`emergency acknowledgement rejects ${name} before database access`, async () => {
    const api = handlers({
      CAMPUSCORE_ADMIN_ALLOWLIST: "admin@smu.edu.sg student@scis.smu.edu.sg",
    });
    const { ctx, access, rows } = context(identity);
    await assert.rejects(
      api.acknowledgeEscalation._handler(ctx, { id: escalationId }),
    );
    assert.deepEqual(access, []);
    assert.equal(rows.get(escalationId).acknowledged_at, null);
  });
  test(`emergency list returns no records for ${name} without database access`, async () => {
    const { ctx, access } = context(identity);
    assert.equal(
      (await handlers().getActiveEscalations._handler(ctx, {})).length,
      0,
    );
    assert.deepEqual(access, []);
  });
}

test("an empty allowlist denies otherwise valid staff in both emergency functions", async () => {
  const api = handlers({ CAMPUSCORE_ADMIN_ALLOWLIST: "" });
  const { ctx, access } = context(admin);
  await assert.rejects(
    api.acknowledgeEscalation._handler(ctx, { id: escalationId }),
  );
  assert.equal((await api.getActiveEscalations._handler(ctx, {})).length, 0);
  assert.deepEqual(access, []);
});

test("another school's student can resolve but cannot gain staff access via the allowlist", async () => {
  const api = handlers({
    CAMPUSCORE_SCHOOL_CODE: "nus",
    CAMPUSCORE_ADMIN_ALLOWLIST: "student@u.nus.edu",
  });
  const { ctx, events, access } = context({
    ...member,
    email: "student@u.nus.edu",
  });
  await api.resolveTicket._handler(ctx, { ticketId });
  assert.equal(events[0].resolver_id, member.subject);
  access.length = 0;
  await assert.rejects(
    api.acknowledgeEscalation._handler(ctx, { id: escalationId }),
  );
  assert.equal((await api.getActiveEscalations._handler(ctx, {})).length, 0);
  assert.deepEqual(access, []);
});

test("allowlisted staff can read and acknowledge an active escalation", async () => {
  const api = handlers();
  const { ctx, rows } = context(admin);
  const active = await api.getActiveEscalations._handler(ctx, {});
  assert.equal(active.length, 1);
  assert.equal(active[0].headline, "Synthetic report");
  await api.acknowledgeEscalation._handler(ctx, { id: escalationId });
  assert.equal(typeof rows.get(escalationId).acknowledged_at, "number");
  assert.equal((await api.getActiveEscalations._handler(ctx, {})).length, 0);
});

for (const timestamp of [0, 123456]) {
  test(`repeat acknowledgement preserves timestamp ${timestamp}`, async () => {
    const { ctx, rows, access } = context(admin, timestamp);
    await handlers().acknowledgeEscalation._handler(ctx, { id: escalationId });
    assert.equal(rows.get(escalationId).acknowledged_at, timestamp);
    assert.ok(!access.includes("patch"));
  });
}

test("missing escalation fails without a write", async () => {
  const { ctx, access } = context(admin);
  await assert.rejects(
    handlers().acknowledgeEscalation._handler(ctx, { id: "missing" }),
    /Escalation not found/,
  );
  assert.ok(!access.includes("patch"));
});
