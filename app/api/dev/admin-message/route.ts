import { handleIncomingWhatsApp } from "@/lib/agent";
import { getAdminPhone } from "@/lib/utils";

export async function POST(request: Request) {
  const { body } = (await request.json()) as { body?: string };
  if (!body) return Response.json({ error: "Body is required" }, { status: 400 });

  const adminPhone = getAdminPhone() || "whatsapp:+94700000000";
  const reply = await handleIncomingWhatsApp({
    from: adminPhone,
    to: process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886",
    body
  });

  return Response.json({ reply });
}
