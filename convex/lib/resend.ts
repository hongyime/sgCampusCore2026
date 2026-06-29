import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Resend } from "resend";

// TASK-30: Resend escalation email stub
// Called by sla.ts or queue.ts when a critical escalation is generated.
export const sendEscalationEmail = internalAction({
  args: {
    ticketId: v.id("tickets"),
    reason: v.string(),
    headline: v.string(),
    location_entity: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const to = process.env.RESEND_ESCALATION_TO;

    if (!apiKey || !from || !to) {
      console.warn(
        "[Resend] Stub mode: missing API key, sender, or recipient. Would have sent escalation email:",
        args,
      );
      return;
    }

    const resend = new Resend(apiKey);
    
    try {
      await resend.emails.send({
        from,
        to,
        subject: `🚨 [URGENT] Escalation: ${args.headline}`,
        html: `
          <h1>Emergency Escalation Triggered</h1>
          <p><strong>Ticket ID:</strong> ${args.ticketId}</p>
          <p><strong>Reason:</strong> ${args.reason}</p>
          <p><strong>Location:</strong> ${args.location_entity}</p>
          <p><strong>Description:</strong> ${args.description}</p>
          <p>Please check the CSOC dashboard immediately.</p>
        `,
      });
      console.log(`[Resend] Escalation email sent for ticket ${args.ticketId}`);
    } catch (error: unknown) {
      console.error(
        "[Resend] Failed to send escalation email:",
        error instanceof Error ? error.message : error,
      );
    }
  }
});
