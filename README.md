# Team Manager Agent

WhatsApp-first reminder agent for small teams. The admin sends weekly task breakdowns, marketing leads, and reminder commands to one Twilio WhatsApp number. The app parses the message, confirms important actions, sends each member their own instructions, collects replies, updates task/lead status, and shows everything in a dashboard.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in:

```bash
ADMIN_PHONE=whatsapp:+947XXXXXXXX
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
GOOGLE_GENERATIVE_AI_API_KEY=...
CRON_SECRET=...
```

3. Run locally:

```bash
npm run dev
```

4. Configure Twilio WhatsApp inbound webhook:

```text
POST https://your-vercel-url.vercel.app/api/twilio/inbound
```

For local testing, use a tunnel URL that points to `/api/twilio/inbound`.

## Admin WhatsApp Commands

```text
Add member Amal whatsapp:+94771234567 marketing
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
Lead for Amal:
Cafe Green Leaf https://maps.google.com/...
Ask him to contact them for marketing.
```

```text
Show today
```

```text
Who has not replied today?
```

Bulk weekly plans ask the admin to reply `CONFIRM` before messages go out.

## Storage

The MVP uses a local JSON file at `.data/team-manager.json` so it works immediately. On Vercel, use a real database before production because serverless file storage is not durable.
