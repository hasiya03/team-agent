import { handleIncomingTelegram } from "@/lib/agent";

export async function GET() {
  return Response.json({
    ok: true,
    route: "telegram/inbound",
    hasBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
  });
}

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (expectedSecret && receivedSecret !== expectedSecret) {
      console.warn("[telegram:inbound:secret-mismatch]", {
        hasExpectedSecret: true,
        hasReceivedSecret: Boolean(receivedSecret)
      });
    }
    if (process.env.TELEGRAM_REQUIRE_WEBHOOK_SECRET === "true" && expectedSecret && receivedSecret !== expectedSecret) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text;
    const chatId = message?.chat?.id;

    if (!chatId || !text) {
      return Response.json({ ok: true });
    }

    const reply = await handleIncomingTelegram({
      chatId,
      text,
      messageId: message.message_id,
      username: message.from?.username,
      firstName: message.from?.first_name
    });

    if (!reply) return Response.json({ ok: true });

    return Response.json({
      method: "sendMessage",
      chat_id: chatId,
      text: reply,
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error("[telegram:inbound:error]", error);
    return Response.json({ ok: true });
  }
}
