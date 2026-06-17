import { handleIncomingTelegram } from "@/lib/agent";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && request.headers.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
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

    if (reply) {
      await sendTelegramMessage(`telegram:${chatId}`, reply);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[telegram:inbound:error]", error);
    return Response.json({ ok: true });
  }
}
