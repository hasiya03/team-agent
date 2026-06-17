import twilio from "twilio";
import { addMessage } from "@/lib/store";
import { sendTelegramMessage } from "@/lib/telegram";

export async function sendWhatsApp(to: string, body: string) {
  if (to.toLowerCase().startsWith("pending:")) {
    console.log("[message:pending-contact]", { to, body });
    return { sid: "pending_contact" };
  }

  if (to.toLowerCase().startsWith("telegram:")) {
    return sendTelegramMessage(to, body);
  }

  const from = process.env.TWILIO_WHATSAPP_FROM;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!from || !sid || !token) {
    console.log("[twilio:dry-run]", { from: from || "missing", to, body });
    await addMessage({ from: from || "dry-run", to, body, direction: "outbound" });
    return { sid: "dry_run" };
  }

  const client = twilio(sid, token);
  try {
    const message = await client.messages.create({ from, to, body });
    await addMessage({ twilioMessageSid: message.sid, from, to, body, direction: "outbound" });
    return message;
  } catch (error) {
    console.error("[twilio:send:error]", { to, error });
    try {
      await addMessage({ from, to, body: `[send failed] ${body}`, direction: "outbound" });
    } catch (storeError) {
      console.error("[twilio:send:store-error]", storeError);
    }
    return { sid: "failed" };
  }
}

export function twiml(message?: string) {
  const response = new twilio.twiml.MessagingResponse();
  if (message) response.message(message);
  return new Response(response.toString(), {
    headers: {
      "Content-Type": "text/xml"
    }
  });
}
