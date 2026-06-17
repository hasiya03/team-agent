import { addMessage } from "@/lib/store";

function telegramApiUrl(method: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  return `https://api.telegram.org/bot${token}/${method}`;
}

export function normalizeTelegramChatId(value: string | number) {
  const raw = String(value).trim();
  return raw.toLowerCase().startsWith("telegram:") ? raw : `telegram:${raw}`;
}

export function telegramChatId(value: string) {
  return normalizeTelegramChatId(value).replace(/^telegram:/i, "");
}

export async function sendTelegramMessage(to: string, body: string) {
  const chatId = telegramChatId(to);
  const from = process.env.TELEGRAM_BOT_USERNAME ? `telegram:${process.env.TELEGRAM_BOT_USERNAME}` : "telegram:bot";
  const url = telegramApiUrl("sendMessage");

  if (!url) {
    console.log("[telegram:dry-run]", { to: chatId, body });
    await addMessage({ from, to: normalizeTelegramChatId(to), body, direction: "outbound" });
    return { ok: true, result: { message_id: "dry_run" } };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.description || `Telegram send failed with ${response.status}`);
    }
    await addMessage({ from, to: normalizeTelegramChatId(to), body, direction: "outbound" });
    return payload;
  } catch (error) {
    console.error("[telegram:send:error]", { to: chatId, error });
    try {
      await addMessage({ from, to: normalizeTelegramChatId(to), body: `[send failed] ${body}`, direction: "outbound" });
    } catch (storeError) {
      console.error("[telegram:send:store-error]", storeError);
    }
    return { ok: false };
  }
}
