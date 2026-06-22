// LLM structured triage (tech_design.md §3.3).
//
// Given sanitized report text, returns constrained JSON used for DISPLAY and
// dashboard sorting only. It must NEVER set priority_tier — that is owned by
// the deterministic severity floor (severityFloor.ts). On a lexicon match the
// caller ignores `severity_score` entirely (§3.2).
//
// Stub-tolerant: with no GROQ_API_KEY configured we return a deterministic,
// offline fallback so the whole pipeline runs against stubs (WAITING_ON_HUMAN).

export interface TriageResult {
  headline: string; // <= 10 words
  severity_score: number; // 0..1, display/sort only — NOT priority_tier
  routing_tag: string;
  location_entity: string;
}

const ROUTING_TAGS = [
  "facilities",
  "janitorial",
  "safety",
  "lost_and_found",
  "general",
] as const;

/**
 * Basic sanitization: replace control chars with spaces, collapse whitespace,
 * cap length. Control chars are stripped via a codepoint scan (no regex
 * control-char class) to keep the source free of literal control bytes.
 */
function sanitize(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 1000);
}

function clampHeadline(s: string): string {
  const words = s.trim().split(/\s+/).slice(0, 10);
  return words.join(" ").slice(0, 120) || "Campus report";
}

/** Deterministic offline fallback (no network). */
function fallbackTriage(text: string): TriageResult {
  const clean = sanitize(text);
  return {
    headline: clampHeadline(clean || "Campus report"),
    severity_score: 0,
    routing_tag: "general",
    location_entity: "Unknown",
  };
}

const SYSTEM_PROMPT =
  "You triage campus issue reports. Return ONLY JSON with keys: " +
  "headline (string, <=10 words), severity_score (number 0..1), " +
  "routing_tag (one of facilities, janitorial, safety, lost_and_found, general), " +
  "location_entity (short building/room/area name, or 'Unknown'). " +
  "Do not include any other keys or prose.";

/**
 * Run structured triage. Uses Groq's OpenAI-compatible chat completions with a
 * JSON response format when GROQ_API_KEY is set; otherwise returns the offline
 * fallback. Always returns a well-formed TriageResult (never throws on a bad
 * model response — it degrades to the fallback).
 */
export async function runTriage(text: string): Promise<TriageResult> {
  const apiKey = process.env.GROQ_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  if (!apiKey) {
    return fallbackTriage(text);
  }

  const clean = sanitize(text);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: clean },
        ],
      }),
      // Keep triage from hanging ingestion; degrade to fallback on timeout.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return fallbackTriage(text);

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallbackTriage(text);

    const parsed = JSON.parse(content) as Partial<TriageResult>;
    const routing = ROUTING_TAGS.includes(parsed.routing_tag as never)
      ? (parsed.routing_tag as string)
      : "general";
    const severity =
      typeof parsed.severity_score === "number"
        ? Math.max(0, Math.min(1, parsed.severity_score))
        : 0;
    return {
      headline: clampHeadline(parsed.headline ?? "Campus report"),
      severity_score: severity,
      routing_tag: routing,
      location_entity:
        (parsed.location_entity ?? "").toString().slice(0, 80) || "Unknown",
    };
  } catch {
    // Network / parse / timeout — degrade gracefully. Do not log raw text (PII).
    return fallbackTriage(text);
  }
}
