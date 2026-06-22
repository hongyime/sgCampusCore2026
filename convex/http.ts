import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { runTriage } from "./lib/llmTriage";

// Telegram webhook ingestion (tech_design.md §1, §3).
//
// Telegram's Bots FAQ allows the webhook to answer ONE API method
// synchronously by returning it as the HTTP response body ("one method per
// update"). We use that slot for `answerCallbackQuery` so an inline-keyboard
// category tap is acknowledged with zero extra API round-trips. Anything that
// needs a real DB write is dispatched to a Convex mutation/action.

// --- Minimal Telegram update typing (only the fields we read) -------------
interface TgUser {
  id: number;
}
interface TgChat {
  id: number;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_unique_id: string }>;
}
interface TgCallbackQuery {
  id: string;
  from: TgUser;
  data?: string; // e.g. "cat:Safety:<ticketId>"
  message?: TgMessage;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

// Synchronous webhook-reply helper: returns a 200 whose JSON body is a single
// Telegram method invocation that Telegram executes on our behalf.
function methodReply(method: string, params: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ method, ...params }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function ack(): Response {
  return new Response(null, { status: 200 });
}

const telegramWebhook = httpAction(async (ctx, request) => {
  // Reject spoofed updates: Telegram echoes the secret we set via setWebhook.
  // The secret lives in Convex env (TELEGRAM_WEBHOOK_SECRET), never in source.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const presentedSecret = request.headers.get(
    "X-Telegram-Bot-Api-Secret-Token",
  );
  if (expectedSecret && presentedSecret !== expectedSecret) {
    return new Response("forbidden", { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // --- Inline-keyboard category tap -------------------------------------
  // Acknowledged synchronously. The actual category write (first-write vs.
  // 15s correction window, TASK-17) is dispatched to a mutation; the
  // user-facing ack does not wait on it.
  if (update.callback_query) {
    const cq = update.callback_query;
    // TASK-17 will parse `cq.data` and call the category-tap mutation here.
    // Skeleton: acknowledge the tap immediately via the synchronous slot.
    return methodReply("answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "Got it.",
    });
  }

  // --- Inbound report message -------------------------------------------
  // Ingestion: run LLM triage (action context has fetch), then hand off to the
  // createTicket mutation which enforces the 30-day gate, resolves the
  // server-owned priority_tier from the lexicon, enqueues egress, and schedules
  // the 60s SLA timer for tier-1.
  if (update.message) {
    const msg = update.message;
    const fromId = msg.from?.id;
    const text = (msg.text ?? msg.caption ?? "").trim();

    // Ignore messages we can't attribute or that carry no report text.
    if (!fromId || !text) {
      return ack();
    }

    const triage = await runTriage(text);
    const result = await ctx.runMutation(internal.ingest.createTicket, {
      telegram_user_id: String(fromId),
      text,
      headline: triage.headline,
      location_entity: triage.location_entity,
      llm_severity_score: triage.severity_score,
    });

    if (!result.ok) {
      // 30-day gate failed (not paired or stale) — prompt re-auth. No ticket.
      return methodReply("sendMessage", {
        chat_id: msg.chat.id,
        text:
          "Please verify your school account to file reports. " +
          "Sign in and re-pair the bot to continue.",
      });
    }

    // Confirm with the immutable ticket id (delivery-semantics §6: the id lets
    // a reader distinguish a retry from a genuine second incident).
    return methodReply("sendMessage", {
      chat_id: msg.chat.id,
      text: `Report received — TICKET #${result.ticketId}. Tap a category to classify it.`,
    });
  }

  // Unknown/ignored update type — acknowledge so Telegram stops retrying.
  return ack();
});

const http = httpRouter();
http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: telegramWebhook,
});

export default http;
