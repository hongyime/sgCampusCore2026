// Unit tests for the deterministic severity floor (tech_design.md §3.2).
//
// Tests the Aho-Corasick automaton + hazard lexicon integration that is the
// ONLY thing setting priority_tier at ingestion. Covers: exact matches,
// case-insensitivity, substring matches, overlapping patterns, empty/benign
// input, and the full HAZARD_LEXICON surface.
//
// Uses the same loadConvex() transpile-at-runtime pattern as the rest of the
// test suite so the REAL TypeScript source is exercised, not a mirror.
//
// Runnable with:  node --test convex/lib/severityFloor.test.mjs
// Or via:         npm run test:unit

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConvex } from "../../config/testing/convex-fixture.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const floor = loadConvex("lib/severityFloor.ts");
const lexicon = loadConvex("lib/lexicon.ts");

const { hazardMatch, resolvePriorityTier, matchedHazards } = floor;
const { HAZARD_LEXICON } = lexicon;
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// Basic contract: every lexicon term triggers tier 1
// ---------------------------------------------------------------------------

describe("severityFloor — every HAZARD_LEXICON term triggers tier 1", () => {
  for (const term of HAZARD_LEXICON) {
    it(`"${term}" alone → tier 1`, () => {
      assert.equal(resolvePriorityTier(term), 1);
      assert.equal(hazardMatch(term), true);
    });

    it(`"${term}" embedded in a sentence → tier 1`, () => {
      assert.equal(resolvePriorityTier(`I saw ${term} near the library`), 1);
    });

    it(`"${term.toUpperCase()}" (uppercase) → tier 1 (case-insensitive)`, () => {
      assert.equal(resolvePriorityTier(term.toUpperCase()), 1);
    });

    it(`"${term[0].toUpperCase()}${term.slice(1)}" (title case) → tier 1`, () => {
      assert.equal(
        resolvePriorityTier(term[0].toUpperCase() + term.slice(1)),
        1,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Benign / no-match inputs → tier 2
// ---------------------------------------------------------------------------

describe("severityFloor — benign inputs → tier 2", () => {
  for (const text of [
    "",
    "   ",
    "The lights are flickering in the hallway",
    "Lost my student card near the cafeteria",
    "Broken chair in seminar room 3.1",
    "WiFi is down on level 4",
    "Air conditioning too cold in the library",
    "Elevator stuck on floor 2",
  ]) {
    it(`"${text.slice(0, 50)}…" → tier 2`, () => {
      assert.equal(resolvePriorityTier(text), 2);
      assert.equal(hazardMatch(text), false);
    });
  }
});

// ---------------------------------------------------------------------------
// matchedHazards returns the correct distinct set
// ---------------------------------------------------------------------------

describe("severityFloor — matchedHazards returns correct distinct terms", () => {
  it("returns empty array for benign text", () => {
    assert.deepEqual(plain(matchedHazards("The door is jammed")), []);
  });

  it("returns single match for one hazard term", () => {
    const result = matchedHazards("There is smoke in the building");
    assert.deepEqual(plain(result), ["smoke"]);
  });

  it("returns multiple distinct matches when several terms appear", () => {
    const result = matchedHazards("I see fire and smoke and broken glass");
    const sorted = [...result].sort();
    assert.deepEqual(plain(sorted), ["fire", "glass", "smoke"]);
  });

  it("deduplicates repeated occurrences of the same term", () => {
    const result = matchedHazards("fire fire fire everywhere fire");
    assert.deepEqual(plain(result), ["fire"]);
  });

  it("matches terms as substrings (Aho-Corasick scans continuously)", () => {
    // "gas" appears inside "gaslighting" — the automaton matches substrings
    const result = matchedHazards("gaslighting");
    assert.deepEqual(plain(result), ["gas"]);
    assert.equal(resolvePriorityTier("gaslighting"), 1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("severityFloor — edge cases", () => {
  it("empty string → tier 2, no matches", () => {
    assert.equal(resolvePriorityTier(""), 2);
    assert.equal(hazardMatch(""), false);
    assert.deepEqual(plain(matchedHazards("")), []);
  });

  it("whitespace-only → tier 2", () => {
    assert.equal(resolvePriorityTier("   \t\n  "), 2);
  });

  it("very long benign text → tier 2", () => {
    const long = "The hallway light is broken. ".repeat(500);
    assert.equal(resolvePriorityTier(long), 2);
  });

  it("very long text with a hazard term at the end → tier 1", () => {
    const long = "The hallway light is broken. ".repeat(500) + "fire";
    assert.equal(resolvePriorityTier(long), 1);
  });

  it("hazard term with surrounding punctuation → tier 1", () => {
    assert.equal(resolvePriorityTier("HELP! FIRE!!!"), 1);
    assert.equal(resolvePriorityTier("(smoke)"), 1);
    assert.equal(resolvePriorityTier("weapon."), 1);
  });

  it("mixed case with Unicode surroundings → tier 1", () => {
    assert.equal(resolvePriorityTier("🚨 BLEEDING 🚨"), 1);
  });
});

// ---------------------------------------------------------------------------
// Drift guard — assert the lexicon and exports still match expectations
// ---------------------------------------------------------------------------

describe("drift guard: severityFloor.ts still exports the expected API", () => {
  const source = readFileSync(resolve(__dirname, "severityFloor.ts"), "utf8");

  it("exports hazardMatch", () => {
    assert.match(source, /export\s+function\s+hazardMatch/);
  });

  it("exports resolvePriorityTier", () => {
    assert.match(source, /export\s+function\s+resolvePriorityTier/);
  });

  it("exports matchedHazards", () => {
    assert.match(source, /export\s+function\s+matchedHazards/);
  });

  it("resolvePriorityTier returns 1 on match, 2 otherwise", () => {
    assert.match(source, /hasMatch\(text\)\s*\?\s*1\s*:\s*2/);
  });

  it("HAZARD_LEXICON has at least 5 terms", () => {
    assert.ok(HAZARD_LEXICON.length >= 5, `Only ${HAZARD_LEXICON.length} terms`);
  });
});
