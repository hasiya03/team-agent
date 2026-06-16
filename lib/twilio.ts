import twilio from "twilio";
import { addMessage } from "@/lib/store";

export async function sendWhatsApp(to: string, body: string) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!from || !sid || !token) {
    console.log("[twilio:dry-run]", { from: from || "missing", to, body });
    await addMessage({ from: from || "dry-run", to, body, direction: "outbound" });
    return { sid: "dry_run" };
  }

  const client = twilio(sid, token);
  const message = await client.messages.create({ from, to, body });
  await addMessage({ twilioMessageSid: message.sid, from, to, body, direction: "outbound" });
  return message;
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
