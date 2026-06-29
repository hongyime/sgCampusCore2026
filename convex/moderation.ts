import { mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type ImageModerationPatch = Pick<Doc<"tickets">, "image_status"> &
  Partial<Pick<Doc<"tickets">, "image_storage_id">>;

// TASK-19: Moderation pipeline ticket update (tech_design §4).
// This is called by the Next.js API route after the image passes Cloudflare (CSAM)
// and is scored by the ONNX Runtime WASM model.
export const updateImageModerationResult = mutation({
  args: {
    ticketId: v.id("tickets"),
    // P >= 0.50 -> removed, P < 0.50 -> broadcast
    status: v.union(v.literal("broadcast"), v.literal("removed")),
    // Valid storage ID if the image was accepted and saved to Convex Storage
    storageId: v.optional(v.id("_storage")),
    // Shared secret to authenticate the Next.js API route
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      throw new Error("Unauthorized");
    }

    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      console.warn(`updateImageModerationResult: Ticket ${args.ticketId} not found`);
      return;
    }

    const updates: ImageModerationPatch = {
      image_status: args.status,
    };

    if (args.status === "broadcast" && args.storageId) {
      updates.image_storage_id = args.storageId;
    }

    await ctx.db.patch(args.ticketId, updates);
  },
});
