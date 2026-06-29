import { NextResponse } from "next/server";

// TASK-36: Legal Escalation Stub (tech_design §8)
// This endpoint is STRICTLY A STUB. As per AGENTS.md, it must never be wired
// to a real legal/law-enforcement address without a separate, human-approved task.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate required fields for the structured payload
    const { clerkUserId, hashMatchRecord, reason } = body;
    
    if (!clerkUserId || !hashMatchRecord) {
      return NextResponse.json(
        { error: "Missing required fields for legal escalation." },
        { status: 400 }
      );
    }

    const payload = {
      timestamp: new Date().toISOString(),
      clerkUserId,
      hashMatchRecord,
      reason: reason || "Manual / Offline review trigger",
    };

    // CONSOLE.LOG ONLY (AGENTS.md hard constraint)
    console.warn("=================================================");
    console.warn("🚨 LEGAL ESCALATION PAYLOAD GENERATED (STUB) 🚨");
    console.warn(JSON.stringify(payload, null, 2));
    console.warn("=================================================");

    return NextResponse.json({ ok: true, stub: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid payload format" },
      { status: 400 }
    );
  }
}
