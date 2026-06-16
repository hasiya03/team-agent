import { handleIncomingWhatsApp } from "@/lib/agent";
import { twiml } from "@/lib/twilio";

export async function POST(request: Request) {
  const form = await request.formData();
  const from = String(form.get("From") || "");
  const to = String(form.get("To") || "");
  const body = String(form.get("Body") || "");
  const twilioMessageSid = String(form.get("MessageSid") || "");

  const reply = await handleIncomingWhatsApp({ from, to, body, twilioMessageSid });
  return twiml(reply);
}
