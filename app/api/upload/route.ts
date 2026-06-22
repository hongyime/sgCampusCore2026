import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { scoreImageNsfw } from "@/convex/lib/nsfwScorer";

export const maxDuration = 10; // Serverless function max duration (Vercel)

// TASK-20 & TASK-21: Telegram Mini App upload bridge
// Forces image upload through the Cloudflare-proxied Next.js API route.
export async function POST(request: Request) {
  try {
    // 1. Receive multipart/form-data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const ticketId = formData.get("ticketId") as string | null;

    if (!file || !ticketId) {
      return NextResponse.json({ error: "Missing file or ticketId" }, { status: 400 });
    }

    // 2. CSAM Scan flag (TASK-20)
    // The actual CSAM scan happens at the Cloudflare edge proxy. If it matches,
    // Cloudflare blocks the request with a 403 before it reaches this origin.
    const csamEnabled = process.env.CSAM_SCAN_ENABLED === "true";
    if (csamEnabled) {
      console.log(`[Upload] CSAM scan is enabled. Request reached origin, meaning no hash match at edge.`);
    }

    // 3. ONNX Runtime WASM NSFW Scoring (TASK-18 & 19)
    const arrayBuffer = await file.arrayBuffer();
    const nsfwScore = await scoreImageNsfw(arrayBuffer);

    // Prepare Convex client
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
    const convex = new ConvexHttpClient(convexUrl);

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!secret) throw new Error("Missing TELEGRAM_WEBHOOK_SECRET");

    // Threshold logic: P >= 0.50 -> delete + placeholder
    if (nsfwScore >= 0.50) {
      console.log(`[Upload] Ticket ${ticketId}: NSFW score ${nsfwScore} >= 0.50. Rejecting image.`);
      
      await convex.mutation(api.moderation.updateImageModerationResult, {
        ticketId: ticketId as any,
        status: "removed",
        secret,
      });

      return NextResponse.json({ ok: true, status: "removed" });
    }

    // 4. Image passed (P < 0.50). Save to Convex Storage.
    console.log(`[Upload] Ticket ${ticketId}: NSFW score ${nsfwScore} < 0.50. Accepting image.`);
    
    // Generate an upload URL and post the file to Convex Storage
    const uploadUrl = await convex.mutation(api.files.generateUploadUrl);

    const uploadResult = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadResult.ok) {
      throw new Error(`Failed to upload to Convex storage: ${uploadResult.statusText}`);
    }

    const { storageId } = await uploadResult.json();

    // 5. Update ticket with "broadcast" status and storageId
    await convex.mutation(api.moderation.updateImageModerationResult, {
      ticketId: ticketId as any,
      status: "broadcast",
      storageId,
      secret,
    });

    return NextResponse.json({ ok: true, status: "broadcast" });

  } catch (error: any) {
    console.error("[Upload] Error processing image:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
