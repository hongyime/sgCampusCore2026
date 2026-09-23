import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

// Real registered handlers; only database/auth services are synthetic.
export function loadConvex(module, globals = {}) {
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
        ...globals,
      },
      { filename: file },
    );
    return loaded.exports;
  }
  return load(resolve(root, "convex", module));
}

// Model the documented index ordering and cursor progression. Atomic() models
// all-or-nothing mutation boundaries; this is not a Convex engine emulator.
export function memoryDatabase(seed = {}) {
  let tables = structuredClone(seed);
  let serial = 10_000;
  let writes = 0;
  let failWrite = Infinity;
  const reads = [];
  const rows = (table) => (tables[table] ??= []);
  const find = (id) =>
    Object.values(tables)
      .flat()
      .find((row) => row._id === id);
  const indexes = {
    by_name: ["name"],
    by_resolver: ["resolver_id"],
    by_rank: ["negative_count", "first_created_at", "resolver_id"],
    by_ticket: ["ticket_id"],
    by_shard: ["shard"],
    by_location: ["location"],
    by_location_shard: ["location", "shard"],
    by_telegram_user: ["telegram_user_id"],
    by_status_priority_created: ["status", "priority_tier", "created_at"],
  };
  const beforeWrite = () => {
    if (++writes === failWrite) throw new Error("Synthetic write failure");
  };
  const db = {
    async get(id) {
      reads.push({ operation: "get", count: 1 });
      return structuredClone(find(id) ?? null);
    },
    async patch(id, patch) {
      beforeWrite();
      assert.ok(find(id));
      Object.assign(find(id), structuredClone(patch));
    },
    async insert(table, value) {
      beforeWrite();
      const id = `${table}-${++serial}`;
      rows(table).push({
        ...structuredClone(value),
        _id: id,
        _creationTime: serial,
      });
      return id;
    },
    query(table) {
      let fields = ["_creationTime"];
      let conditions = [];
      const select = () =>
        rows(table)
          .filter((row) =>
            conditions.every(([key, value]) => row[key] === value),
          )
          .toSorted((a, b) => {
            for (const key of fields) {
              if (a[key] < b[key]) return -1;
              if (a[key] > b[key]) return 1;
            }
            return 0;
          });
      return {
        withIndex(name, fn) {
          assert.ok(indexes[name]);
          fields = [...indexes[name], "_creationTime"];
          const builder = {
            eq(key, value) {
              conditions.push([key, value]);
              return builder;
            },
          };
          fn?.(builder);
          return this;
        },
        async unique() {
          const values = select();
          assert.ok(values.length <= 1);
          reads.push({ table, operation: "unique", count: values.length });
          return structuredClone(values[0] ?? null);
        },
        async first() {
          const values = select();
          reads.push({ table, operation: "first", count: Math.min(values.length, 1) });
          return structuredClone(values[0] ?? null);
        },
        async take(count) {
          const values = select().slice(0, count);
          reads.push({
            table,
            operation: "take",
            count: values.length,
            limit: count,
          });
          return structuredClone(values);
        },
        async collect() {
          const values = select();
          reads.push({ table, operation: "collect", count: values.length });
          return structuredClone(values);
        },
        async paginate(options) {
          assert.ok(
            options.maximumRowsRead > 0 && options.maximumBytesRead > 0,
          );
          const available = select().filter(
            (row) =>
              !options.cursor || row._creationTime > Number(options.cursor),
          );
          const page = [];
          let bytes = 0;
          for (const row of available.slice(
            0,
            Math.min(options.numItems, options.maximumRowsRead),
          )) {
            const size = Buffer.byteLength(JSON.stringify(row));
            if (bytes + size > options.maximumBytesRead) break;
            page.push(row);
            bytes += size;
          }
          reads.push({
            table,
            operation: "paginate",
            count: page.length,
            bytes,
            options,
          });
          return {
            page: structuredClone(page),
            isDone: page.length === available.length,
            continueCursor: String(
              page.at(-1)?._creationTime ?? options.cursor ?? "0",
            ),
          };
        },
      };
    },
  };
  return {
    db,
    reads,
    rows: (table) => structuredClone(rows(table)),
    failOnWrite(number) {
      failWrite = writes + number;
    },
    async atomic(action) {
      const snapshot = structuredClone(tables);
      try {
        return await action();
      } catch (error) {
        tables = snapshot;
        throw error;
      }
    },
  };
}
