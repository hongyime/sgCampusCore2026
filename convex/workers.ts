import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

type TelegramPayload =
  | { chat_id: string; text: string }
  | { chat_id: string; photo: string; caption: string };

type FinalizeResult = {
  id: Id<"_telegram_egress_queue">;
  success: boolean;
};

// Helper to broadcast a ticket to the Telegram channel (TASK-27)
async function broadcastTicket(
  ctx: ActionCtx,
  ticket: Doc<"tickets">,
): Promise<boolean> {
  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.warn("[Workers] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID. Skipping broadcast.");
    return false; // Fail so it retries
  }

  // Prefix with immutable ticket_id
  const prefix = ticket.priority_tier === 1 
    ? `[🚨 URGENT - TICKET #${ticket._id}]` 
    : `[TICKET #${ticket._id}]`;
    
  let text = `${prefix}\n\n${ticket.headline}\nCategory: ${ticket.category || "Uncategorized"}\nLocation: ${ticket.location_entity}\n\n${ticket.description}`;

  if (ticket.image_status === "removed") {
    text += `\n\n[Image automatically removed]`;
  }

  let endpoint = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  let payload: TelegramPayload = {
    chat_id: CHANNEL_ID,
    text: text,
  };

  // If there's a stored image, send it as a photo
  if (ticket.image_status === "broadcast" && ticket.image_storage_id) {
    const imageUrl = await ctx.storage.getUrl(ticket.image_storage_id);
    if (imageUrl) {
      endpoint = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
      payload = {
        chat_id: CHANNEL_ID,
        photo: imageUrl,
        caption: text,
      };
    }
  }

  const controller = new AbortController();
  // 5s AbortSignal per request
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Workers] Telegram API error for ticket ${ticket._id}: ${response.status} ${errText}`);
      return false;
    }
    return true;
  } catch (error: unknown) {
    console.error(
      `[Workers] Broadcast failed for ticket ${ticket._id}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// TASK-25: Worker A — Emergency Express action (Batch=1, tier-1)
export const workerA = internalAction({
  args: {},
  handler: async (ctx) => {
    // Atomically claim up to 1 tier-1 ticket
    const batch = await ctx.runMutation(internal.queue.claimBatch, {
      limit: 1,
      priority_tier: 1,
    });

    if (batch.length === 0) return;

    const results: FinalizeResult[] = [];
    for (const row of batch) {
      const ticket = await ctx.runQuery(internal.queue.getTicket, { id: row.ticket_id });
      if (!ticket) {
        results.push({ id: row._id, success: false });
        continue;
      }
      
      const success = await broadcastTicket(ctx, ticket);
      results.push({ id: row._id, success });
    }

    // Finalize the batch
    await ctx.runMutation(internal.queue.finalizeBatch, { results });
  }
});

// TASK-26: Worker B — Standard Batch action (Batch=25, tier-2)
export const workerB = internalAction({
  args: {},
  handler: async (ctx) => {
    // Atomically claim up to 25 tier-2 tickets
    const batch = await ctx.runMutation(internal.queue.claimBatch, {
      limit: 25,
      priority_tier: 2,
    });

    if (batch.length === 0) return;

    // Use Promise.allSettled with per-request 5s AbortSignals
    const promises = batch.map(async (row) => {
      const ticket = await ctx.runQuery(internal.queue.getTicket, { id: row.ticket_id });
      if (!ticket) {
        return { id: row._id, success: false };
      }
      const success = await broadcastTicket(ctx, ticket);
      return { id: row._id, success };
    });

    const outcomes = await Promise.allSettled(promises);
    
    const results = outcomes.map((outcome, idx) => {
      if (outcome.status === "fulfilled") {
        return outcome.value;
      } else {
        // Fallback for rejected promise
        return { id: batch[idx]._id, success: false };
      }
    });

    // Finalize the batch
    await ctx.runMutation(internal.queue.finalizeBatch, { results });
  }
});
