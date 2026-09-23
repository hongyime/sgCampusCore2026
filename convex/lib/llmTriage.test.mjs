// Unit tests for the LLM triage pure functions (tech_design.md §3.3).
//
// Tests the sanitize, clampHeadline, and fallbackTriage functions that are
// exercised on every ingestion path. The LLM network call itself requires
// GROQ_API_KEY and is tested only via the fallback path (no credentials
// needed). The pure functions are the safety net that ensures well-formed
// output regardless of LLM availability.
//
// WHY THIS IS A MIRROR:
//   convex/lib/llmTriage.ts imports no Convex codegen, but its functions are
//   not individually exported — only `runTriage` is. The sanitize,
//   clampHeadline, and fallbackTriage functions are module-private. We mirror
//   them here (same pattern as resend.test.mjs) and add a drift guard that
//   asserts the source still contains the same logic shapes.
//
// Runnable with:  node --test convex/lib/llmTriage.test.mjs
// Or via:         npm run test:unit

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Mirrored pure functions from convex/lib/llmTriage.ts
// ---------------------------------------------------------------------------

function sanitize(text) {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function clampHeadline(s) {
  const words = s.trim().split(/\s+/).slice(0, 10);
  return words.join(" ").slice(0, 120) || "Campus report";
}

function fallbackTriage(text) {
  const clean = sanitize(text);
  return {
    headline: clampHeadline(clean || "Campus report"),
    severity_score: 0,
    routing_tag: "general",
    location_entity: "Unknown",
  };
}

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------

describe("sanitize — control character and whitespace handling", () => {
  it("strips control characters (\\x00-\\x1f, \\x7f) replacing with spaces", () => {
    assert.equal(sanitize("hello\x00world"), "hello world");
    assert.equal(sanitize("tab\there"), "tab here");
    assert.equal(sanitize("newline\nhere"), "newline here");
    assert.equal(sanitize("cr\rhere"), "cr here");
    assert.equal(sanitize("del\x7fete"), "del ete");
  });

  it("collapses multiple whitespace into single space", () => {
    assert.equal(sanitize("too   many    spaces"), "too many spaces");
    assert.equal(sanitize("  leading and trailing  "), "leading and trailing");
  });

  it("caps output at 1000 characters", () => {
    const long = "a".repeat(2000);
    assert.equal(sanitize(long).length, 1000);
  });

  it("handles empty string", () => {
    assert.equal(sanitize(""), "");
  });

  it("handles whitespace-only string", () => {
    assert.equal(sanitize("   \t\n  "), "");
  });

  it("preserves Unicode (emoji, CJK, diacritics)", () => {
    assert.equal(sanitize("🚨 火灾 café"), "🚨 火灾 café");
  });

  it("handles mixed control chars and valid text", () => {
    assert.equal(
      sanitize("\x01Report:\x02 broken\x03 pipe\x04"),
      "Report: broken pipe",
    );
  });
});

// ---------------------------------------------------------------------------
// clampHeadline
// ---------------------------------------------------------------------------

describe("clampHeadline — word and character limits", () => {
  it("returns input unchanged when <= 10 words and <= 120 chars", () => {
    assert.equal(clampHeadline("Broken window in SIS"), "Broken window in SIS");
  });

  it("truncates to 10 words", () => {
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const result = clampHeadline(words.join(" "));
    assert.equal(result.split(/\s+/).length, 10);
  });

  it("truncates to 120 characters after word limit", () => {
    const words = Array.from({ length: 10 }, () => "a".repeat(20));
    const result = clampHeadline(words.join(" "));
    assert.ok(result.length <= 120, `Length ${result.length} exceeds 120`);
  });

  it("returns 'Campus report' for empty string", () => {
    assert.equal(clampHeadline(""), "Campus report");
  });

  it("returns 'Campus report' for whitespace-only", () => {
    assert.equal(clampHeadline("   "), "Campus report");
  });

  it("trims leading/trailing whitespace", () => {
    assert.equal(clampHeadline("  hello world  "), "hello world");
  });
});

// ---------------------------------------------------------------------------
// fallbackTriage
// ---------------------------------------------------------------------------

describe("fallbackTriage — deterministic offline fallback", () => {
  it("returns well-formed TriageResult for normal text", () => {
    const result = fallbackTriage("Broken pipe in the basement");
    assert.equal(typeof result.headline, "string");
    assert.equal(result.severity_score, 0);
    assert.equal(result.routing_tag, "general");
    assert.equal(result.location_entity, "Unknown");
    assert.ok(result.headline.length > 0);
    assert.ok(result.headline.length <= 120);
  });

  it("returns 'Campus report' headline for empty text", () => {
    const result = fallbackTriage("");
    assert.equal(result.headline, "Campus report");
    assert.equal(result.severity_score, 0);
    assert.equal(result.routing_tag, "general");
    assert.equal(result.location_entity, "Unknown");
  });

  it("sanitizes control characters in the headline", () => {
    const result = fallbackTriage("Broken\x00pipe\x01in\x02basement");
    assert.ok(!result.headline.includes("\x00"));
    assert.ok(!result.headline.includes("\x01"));
    assert.ok(!result.headline.includes("\x02"));
  });

  it("caps headline at 10 words even for very long input", () => {
    const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const result = fallbackTriage(long);
    assert.ok(result.headline.split(/\s+/).length <= 10);
  });

  it("severity_score is always 0 in fallback", () => {
    assert.equal(fallbackTriage("FIRE EMERGENCY").severity_score, 0);
  });

  it("routing_tag is always 'general' in fallback", () => {
    assert.equal(fallbackTriage("Safety concern").routing_tag, "general");
  });
});

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe("drift guard: llmTriage.ts still contains the mirrored logic", () => {
  const source = readFileSync(resolve(__dirname, "llmTriage.ts"), "utf8");

  it("exports runTriage", () => {
    assert.match(source, /export\s+async\s+function\s+runTriage/);
  });

  it("contains sanitize function with codepoint scan", () => {
    assert.match(source, /function\s+sanitize/);
    assert.match(source, /codePointAt/);
    assert.match(source, /\.slice\(0,\s*1000\)/);
  });

  it("contains clampHeadline with 10-word and 120-char limits", () => {
    assert.match(source, /function\s+clampHeadline/);
    assert.match(source, /\.slice\(0,\s*10\)/);
    assert.match(source, /\.slice\(0,\s*120\)/);
  });

  it("contains fallbackTriage returning the four required fields", () => {
    assert.match(source, /function\s+fallbackTriage/);
    assert.match(source, /headline:/);
    assert.match(source, /severity_score:\s*0/);
    assert.match(source, /routing_tag:\s*"general"/);
    assert.match(source, /location_entity:\s*"Unknown"/);
  });

  it("falls back when GROQ_API_KEY is missing", () => {
    assert.match(source, /process\.env\.GROQ_API_KEY/);
    assert.match(source, /if\s*\(\s*!apiKey\s*\)/);
  });

  it("clamps severity_score to 0..1 range", () => {
    assert.match(source, /Math\.max\(0,\s*Math\.min\(1/);
  });
});
