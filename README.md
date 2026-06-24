# Team Manager Agent

Telegram-first reminder agent for small teams, with optional Twilio WhatsApp support. The admin sends weekly task breakdowns, marketing leads, and reminder commands to one bot. The app parses the message, confirms important actions, sends each member their own instructions, collects replies, updates task/lead status, and shows everything in a dashboard.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in:

```bash
ADMIN_PHONE=telegram:123456789
TELEGRAM_ADMIN_CHAT_ID=123456789
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=your_bot_username
TELEGRAM_WEBHOOK_SECRET=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
GOOGLE_GENERATIVE_AI_API_KEY=...
CRON_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NOTION_TOKEN=...
NOTION_CONTENT_PLAN_ID=c7324cb8882449679e09325cf8ee9981
NOTION_DEV_TASKS_ID=3641c6c163958053b515cfb2f9893414
NOTION_JOBS_ID=3641c6c1639580ef8cfdc17406c56fa7
NOTION_MEETING_NOTES_ID=3641c6c1639580269fadf4ea21540cfe
```

3. Run locally:

```bash
npm run dev
```

4. Create a Telegram bot with `@BotFather`, copy the token, then configure the Telegram webhook:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-vercel-url.vercel.app/api/telegram/inbound&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

5. Optional: configure Twilio WhatsApp inbound webhook:

```text
POST https://your-vercel-url.vercel.app/api/twilio/inbound
```

For local WhatsApp testing, use a tunnel URL that points to `/api/twilio/inbound`.

## Admin Telegram Messages

```text
Add member Amal telegram:123456789 marketing
```

```text
Add Amal whatsapp:+94771234567
```

```text
Add Lasandu telegram:987654321 Developer
```

Members can link themselves after the admin has added their name:

```text
/start Amal
```

```text
Weekly tasks:
Amal:
- Contact 10 leads by Friday
- Send daily marketing update

Hasin:
- Finish landing page by Wednesday
```

```text
Weekly task for Amal: Develop frontend of Berl by Wednesday
```

```text
Weekly task for Amal: need 02 social posts and also need to design a Berl logo by Wednesday
```

```text
Lead for Amal:
Cafe Green Leaf https://maps.google.com/...
Ask him to contact them for marketing.
```

```text
Show today
```

```text
Daily summary
```

```text
Who has not replied today?
```

```text
Send reminders now
```

```text
Remind Amal now
```

Bulk weekly plans ask the admin to reply `CONFIRM` before messages go out.

## Storage

The MVP uses Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Run `supabase/schema.sql` in the Supabase SQL Editor first.

If Supabase env vars are missing, the app falls back to a local JSON file at `.data/team-manager.json` so it works immediately during local development.

## Notion Sync

When `NOTION_TOKEN` is set, newly created tasks are also mirrored into Notion if the bot can infer the right target table.

- Content/social/design work goes to `NOTION_CONTENT_PLAN_ID`.
- Software/dev/bug/feature work goes to `NOTION_DEV_TASKS_ID`.
- Property/job/site/training/shooting work goes to `NOTION_JOBS_ID`.
- Meeting notes can go to `NOTION_MEETING_NOTES_ID`.

Share each Notion database with your internal Notion integration and give the integration insert/write access. The bot leaves Notion Person fields empty for now and writes the Telegram member name into the notes/description field.

When deployed on Vercel without `DATA_DIR`, the app falls back to `/tmp/team-manager-agent` so webhooks do not crash on the read-only deployment filesystem. This is only temporary storage and can be reset by Vercel between function instances.

## Vercel Hobby Cron

Vercel Hobby only allows cron jobs that run once per day. The included cron is set to `30 3 * * *`, which runs around 9:00 AM in Sri Lanka. Upgrade to Vercel Pro or use an external scheduler if you need reminders more than once per day.
