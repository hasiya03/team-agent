import type { Task, TeamMember } from "@/lib/types";

type NotionTarget = "content" | "dev" | "job" | "meeting";

export interface NotionTaskSyncInput {
  task: Task;
  member?: TeamMember;
  sourceText?: string;
  business?: string;
  notionTarget?: NotionTarget;
}

const notionVersion = "2022-06-28";

const defaultDatabaseIds: Record<NotionTarget, string> = {
  content: "c7324cb8882449679e09325cf8ee9981",
  dev: "3641c6c163958053b515cfb2f9893414",
  job: "3641c6c1639580ef8cfdc17406c56fa7",
  meeting: "3641c6c1639580269fadf4ea21540cfe"
};

export async function syncTasksToNotion(items: NotionTaskSyncInput[]) {
  if (!process.env.NOTION_TOKEN || !items.length) return { synced: 0, skipped: items.length };

  let synced = 0;
  let skipped = 0;

  for (const item of items) {
    const target = item.notionTarget || inferNotionTarget(item);
    if (!target) {
      skipped += 1;
      continue;
    }

    const databaseId = getDatabaseId(target);
    if (!databaseId) {
      skipped += 1;
      continue;
    }

    try {
      await createNotionTaskPage(databaseId, target, item);
      synced += 1;
    } catch (error) {
      console.error("Notion task sync failed", {
        taskId: item.task.id,
        target,
        error: error instanceof Error ? error.message : String(error)
      });
      skipped += 1;
    }
  }

  return { synced, skipped };
}

function getDatabaseId(target: NotionTarget) {
  const fromEnv =
    target === "content"
      ? process.env.NOTION_CONTENT_PLAN_ID || process.env.NOTION_BERL_VIEW_CONTENT_ID
      : target === "dev"
        ? process.env.NOTION_DEV_TASKS_ID || process.env.NOTION_BERL_IT_DEV_TASKS_ID
        : target === "job"
          ? process.env.NOTION_JOBS_ID || process.env.NOTION_BERL_VIEW_JOBS_ID
          : process.env.NOTION_MEETING_NOTES_ID;

  return normalizeNotionId(fromEnv || defaultDatabaseIds[target]);
}

async function createNotionTaskPage(databaseId: string, target: NotionTarget, item: NotionTaskSyncInput) {
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": notionVersion
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: buildProperties(target, item)
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Notion ${response.status}: ${detail}`);
  }
}

function buildProperties(target: NotionTarget, item: NotionTaskSyncInput) {
  if (target === "content") return contentProperties(item);
  if (target === "dev") return devTaskProperties(item);
  if (target === "job") return jobProperties(item);
  return meetingProperties(item);
}

function contentProperties(item: NotionTaskSyncInput) {
  const text = searchableText(item);
  const platforms = inferPlatforms(text);
  return compactProperties({
    "Content Title": title(item.task.title),
    Status: status("Planned"),
    Type: select(inferContentTypeGroup(text)),
    "Content Type": select(inferContentFormat(text)),
    Platforms: platforms.length ? multiSelect(platforms) : undefined,
    Objective: richText(taskNotes(item)),
    "Date Posted": date(item.task.deadline)
  });
}

function devTaskProperties(item: NotionTaskSyncInput) {
  const text = searchableText(item);
  return compactProperties({
    "Task name": title(item.task.title),
    Status: status("Not started"),
    "Due date": date(item.task.deadline),
    Priority: select(inferPriority(text)),
    "Task type": multiSelect(inferDevTaskTypes(text)),
    Description: richText(taskNotes(item))
  });
}

function jobProperties(item: NotionTaskSyncInput) {
  const text = searchableText(item);
  return compactProperties({
    "Job Name": title(item.task.title),
    Status: status("To Do"),
    "Due Date": date(item.task.deadline),
    Priority: select(inferPriority(text)),
    Notes: richText(taskNotes(item)),
    "Square Feet": numberValue(inferSquareFeet(text))
  });
}

function meetingProperties(item: NotionTaskSyncInput) {
  return compactProperties({
    "Meeting Title": title(item.task.title),
    "Meeting Date": date(item.task.deadline || item.task.createdAt),
    Summary: richText(taskNotes(item))
  });
}

function inferNotionTarget(item: NotionTaskSyncInput): NotionTarget | undefined {
  const text = searchableText(item);
  if (/\b(dev|development|bug|feature|code|website|web\s?app|backend|frontend|api|software)\b/i.test(text)) return "dev";
  if (/\b(job|site|shoot|shooting|training|square\s?feet|sqft|property|house|apartment|villa)\b/i.test(text)) return "job";
  if (/\b(meeting|sync|review|planning|call)\b/i.test(text)) return "meeting";
  if (/\b(content|post|posts|video|image|carousel|carousal|social|facebook|instagram|tiktok|youtube|linkedin|logo|banner|design)\b/i.test(text)) {
    return "content";
  }
  if (/\bberl\s*it|it\s*solutions\b/i.test(text)) return "dev";
  if (/\blekana|berl\s*view\b/i.test(text)) return "content";
  return process.env.NOTION_DEFAULT_TASK_TARGET as NotionTarget | undefined;
}

function taskNotes(item: NotionTaskSyncInput) {
  return [
    item.member ? `Assigned in Telegram to: ${item.member.name}` : undefined,
    item.business ? `Business: ${item.business}` : undefined,
    item.task.description,
    `Bot task ID: ${item.task.id}`
  ]
    .filter(Boolean)
    .join("\n");
}

function searchableText(item: NotionTaskSyncInput) {
  return [item.business, item.notionTarget, item.task.title, item.task.description, item.sourceText].filter(Boolean).join(" ");
}

function normalizeNotionId(value?: string) {
  if (!value) return "";
  const match = value.match(/[0-9a-f]{32}/i);
  return (match?.[0] || value).replace(/-/g, "");
}

function compactProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null));
}

function title(content: string) {
  return { title: [{ text: { content: truncate(content, 2000) } }] };
}

function richText(content?: string) {
  if (!content) return undefined;
  return { rich_text: [{ text: { content: truncate(content, 2000) } }] };
}

function status(name?: string) {
  return name ? { status: { name } } : undefined;
}

function select(name?: string) {
  return name ? { select: { name } } : undefined;
}

function multiSelect(names: string[]) {
  return { multi_select: names.map((name) => ({ name })) };
}

function date(value?: string) {
  return value ? { date: { start: value.slice(0, 10) } } : undefined;
}

function numberValue(value?: number) {
  return value ? { number: value } : undefined;
}

function inferContentTypeGroup(text: string) {
  if (/\b(education|educational|learn|tips|guide|how to)\b/i.test(text)) return "Education";
  if (/\b(promo|promotion|offer|sale|discount)\b/i.test(text)) return "Promotion";
  if (/\b(marketing|campaign|ad|advertisement)\b/i.test(text)) return "Marketing";
  return "Marketing";
}

function inferContentFormat(text: string) {
  if (/\b(video|reel|short)\b/i.test(text)) return "Video";
  if (/\b(carousel|carousal)\b/i.test(text)) return "Carousal";
  if (/\b(image|post|logo|banner|design)\b/i.test(text)) return "Image";
  return undefined;
}

function inferPlatforms(text: string) {
  const platforms = [
    ["Facebook", /\bfacebook|fb\b/i],
    ["TikTok", /\btiktok\b/i],
    ["YouTube", /\byoutube|yt\b/i],
    ["Instagram", /\binstagram|insta|ig\b/i],
    ["LinkedIn", /\blinkedin\b/i],
    ["X (Twitter)", /\btwitter|\bx\b/i],
    ["Website", /\bwebsite|site\b/i],
    ["Email", /\bemail|newsletter\b/i]
  ] as const;

  return platforms.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function inferPriority(text: string) {
  if (/\b(high|urgent|asap|important)\b/i.test(text)) return "High";
  if (/\b(low|whenever)\b/i.test(text)) return "Low";
  return "Medium";
}

function inferDevTaskTypes(text: string) {
  const types = [];
  if (/\bbug|fix|error|issue|broken\b/i.test(text)) types.push("🐞 Bug");
  if (/\bfeature|request|add|build|implement\b/i.test(text)) types.push("💬 Feature request");
  if (/\bpolish|ui|style|design|align|spacing\b/i.test(text)) types.push("💅 Polish");
  return types.length ? types : ["💬 Feature request"];
}

function inferSquareFeet(text: string) {
  const match = text.match(/\b(\d[\d,]*)\s*(?:sq(?:uare)?\.?\s*ft|square\s+feet|sqft)\b/i);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
