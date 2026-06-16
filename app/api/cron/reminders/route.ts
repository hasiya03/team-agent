import { buildDailyReminders } from "@/lib/agent";
import { getDueReminders, markReminderSent, readState } from "@/lib/store";
import { sendWhatsApp } from "@/lib/twilio";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && request.headers.get("user-agent") !== "vercel-cron/1.0") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await buildDailyReminders();
  const state = await readState();
  const due = await getDueReminders(20);
  const sent = [];

  for (const reminder of due) {
    const member = state.members.find((item) => item.id === reminder.memberId);
    if (!member) {
      await markReminderSent(reminder.id, false);
      continue;
    }
    try {
      await sendWhatsApp(member.phone, reminder.body);
      await markReminderSent(reminder.id, true);
      sent.push(reminder.id);
    } catch {
      await markReminderSent(reminder.id, false);
    }
  }

  return Response.json({ queued: due.length, sent: sent.length });
}
