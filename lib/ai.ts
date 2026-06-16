import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AppState, LeadStatus, TaskStatus } from "@/lib/types";

const model = google(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite");

const adminIntentSchema = z.object({
  intent: z.enum(["add_member", "add_task", "weekly_plan", "lead_assignment", "status_query", "broadcast", "unknown"]),
  targetMemberName: z.string().optional(),
  memberPhone: z.string().optional(),
  memberRole: z.string().optional(),
  message: z.string().optional(),
  lead: z
    .object({
      businessName: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      address: z.string().optional(),
      googleMapsUrl: z.string().optional(),
      notes: z.string().optional()
    })
    .optional(),
  weeklyTasks: z
    .array(
      z.object({
        memberName: z.string(),
        title: z.string(),
        deadline: z.string().optional(),
        description: z.string().optional()
      })
    )
    .optional(),
  task: z
    .object({
      memberName: z.string(),
      title: z.string(),
      deadline: z.string().optional(),
      description: z.string().optional()
    })
    .optional(),
  tasks: z
    .array(
      z.object({
        memberName: z.string(),
        title: z.string(),
        deadline: z.string().optional(),
        description: z.string().optional()
      })
    )
    .optional()
});

export type AdminIntent = z.infer<typeof adminIntentSchema>;

const memberReplySchema = z.object({
  taskUpdates: z.array(
    z.object({
      taskId: z.string().optional(),
      taskTitleHint: z.string().optional(),
      status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
      note: z.string().optional()
    })
  ),
  leadUpdates: z.array(
    z.object({
      leadId: z.string().optional(),
      leadNameHint: z.string().optional(),
      status: z.enum(["new", "contacted", "interested", "not_interested", "no_answer", "follow_up", "closed"]),
      note: z.string().optional(),
      nextFollowUpAt: z.string().optional()
    })
  ),
  memorySummary: z.string().describe("Short durable memory about this member based on the latest reply and prior memory.")
});

export type MemberReplyInterpretation = z.infer<typeof memberReplySchema>;

const conversationIntentSchema = z.object({
  senderRole: z.enum(["admin", "member"]),
  intent: z.enum([
    "add_member",
    "add_task",
    "weekly_plan",
    "lead_assignment",
    "status_query",
    "list_open_tasks",
    "list_member_tasks",
    "list_my_tasks",
    "send_reminder",
    "get_member_latest_reply",
    "set_task_deadline",
    "edit_task",
    "delete_task",
    "reassign_task",
    "broadcast",
    "confirm",
    "cancel",
    "member_status_update",
    "unknown"
  ]),
  confidence: z.number().optional(),
  targetMemberName: z.string().optional(),
  memberPhone: z.string().optional(),
  memberRole: z.string().optional(),
  taskId: z.string().optional(),
  taskTitleHint: z.string().optional(),
  deadline: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]).optional(),
  message: z.string().optional(),
  reply: z.string().optional(),
  lead: adminIntentSchema.shape.lead,
  task: adminIntentSchema.shape.task,
  tasks: adminIntentSchema.shape.tasks,
  weeklyTasks: adminIntentSchema.shape.weeklyTasks
});

export type ConversationIntent = z.infer<typeof conversationIntentSchema>;

function hasGeminiKey() {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

export async function classifyConversationMessage(params: {
  senderRole: "admin" | "member";
  body: string;
  state: AppState;
  memberId?: string;
}): Promise<ConversationIntent> {
  if (!hasGeminiKey()) return classifyConversationHeuristic(params);

  const member = params.memberId ? params.state.members.find((item) => item.id === params.memberId) : undefined;
  const openTasks = params.state.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const recentMessages = params.state.messages.slice(0, 20).map((message) => ({
    direction: message.direction,
    from: message.from,
    body: message.body,
    createdAt: message.createdAt
  }));

  const { output } = await generateText({
    model,
    output: Output.object({ schema: conversationIntentSchema }),
    system: [
      "You are a WhatsApp operations agent for a small Sri Lankan team.",
      "Classify the latest message conversation-wise before any action is taken.",
      "Return only one intent and structured fields needed by the app.",
      "Questions must be classified as query intents, not as task updates.",
      "Member questions like 'what are my tasks' are list_my_tasks.",
      "Admin questions like 'what are open tasks' are list_open_tasks.",
      "Admin questions like 'what did laski reply' are get_member_latest_reply.",
      "Reminder requests are send_reminder.",
      "Deletion or risky changes must be classified, but the app will ask confirmation.",
      "Use ISO dates when a deadline is clear. If a date is relative, infer from currentDate.",
      "Do not invent members, phone numbers, leads, or tasks."
    ].join("\n"),
    prompt: JSON.stringify({
      currentDate: new Date().toISOString(),
      senderRole: params.senderRole,
      senderMember: member ? { id: member.id, name: member.name, phone: member.phone, role: member.role } : undefined,
      knownMembers: params.state.members.map((item) => ({ id: item.id, name: item.name, role: item.role, phone: item.phone })),
      openTasks: openTasks.map((task) => ({
        id: task.id,
        memberId: task.memberId,
        memberName: params.state.members.find((item) => item.id === task.memberId)?.name,
        title: task.title,
        deadline: task.deadline,
        status: task.status
      })),
      recentMessages,
      latestMessage: params.body
    })
  });

  return output;
}

function classifyConversationHeuristic(params: {
  senderRole: "admin" | "member";
  body: string;
  state: AppState;
  memberId?: string;
}): ConversationIntent {
  const text = params.body.trim();
  if (/^confirm$/i.test(text)) return { senderRole: params.senderRole, intent: "confirm", confidence: 1 };
  if (/^cancel$/i.test(text)) return { senderRole: params.senderRole, intent: "cancel", confidence: 1 };

  if (params.senderRole === "member") {
    if (/\b(my|weekly|open|remaining)\b.*\b(tasks?|work)\b|\bwhat\b.*\b(tasks?|work)\b/i.test(text)) {
      return { senderRole: "member", intent: "list_my_tasks", confidence: 0.85, message: text };
    }
    return { senderRole: "member", intent: "member_status_update", confidence: 0.7, message: text };
  }

  const reminder = text.match(/\b(?:send\s+)?(?:remind(?:er)?|remaind?er)\s+(?:to\s+)?(all|[a-zA-Z ]+)?/i);
  if (reminder) {
    return { senderRole: "admin", intent: "send_reminder", targetMemberName: reminder[1]?.trim(), confidence: 0.8 };
  }

  const replyQuery = text.match(/\b(?:what(?:'s|s| is)?|show|get)\s+([a-zA-Z ]+)\s+(?:reply|said|update)/i);
  if (replyQuery) {
    return { senderRole: "admin", intent: "get_member_latest_reply", targetMemberName: replyQuery[1].trim(), confidence: 0.8 };
  }

  if (/\bopen\b.*\btasks?\b|\btasks?\b.*\bopen\b/i.test(text)) {
    return { senderRole: "admin", intent: "list_open_tasks", confidence: 0.8, message: text };
  }

  const deadline = text.match(/\b(?:set|change|update)\s+(?:deadline|due)\b.*\b(?:for|to)\s+(.+)/i);
  if (deadline) {
    return { senderRole: "admin", intent: "set_task_deadline", message: text, confidence: 0.55 };
  }

  const heuristic = parseAdminMessageHeuristic(text);
  if (heuristic.intent !== "unknown") {
    return { senderRole: "admin", ...heuristic, confidence: 0.75 };
  }

  return { senderRole: "admin", intent: "unknown", message: text, confidence: 0.2 };
}

export async function parseAdminMessage(body: string, state: AppState): Promise<AdminIntent> {
  const heuristic = parseAdminMessageHeuristic(body);
  if (heuristic.intent !== "unknown") return heuristic;
  if (!hasGeminiKey()) return heuristic;

  const { output } = await generateText({
    model,
    output: Output.object({ schema: adminIntentSchema }),
    system: [
      "You are a WhatsApp operations agent for a small Sri Lankan team.",
      "Classify the admin message and extract structured data.",
      "Use ISO dates when a deadline is clear. If a date is relative, infer from the current date.",
      "Do not invent phone numbers, websites, or business names."
    ].join("\n"),
    prompt: JSON.stringify({
      currentDate: new Date().toISOString(),
      knownMembers: state.members.map((member) => ({ name: member.name, role: member.role, phone: member.phone })),
      adminMessage: body
    })
  });

  return output;
}

export async function interpretMemberReply(memberId: string, body: string, state: AppState): Promise<MemberReplyInterpretation> {
  const openTasks = state.tasks.filter((task) => task.memberId === memberId && !["done", "cancelled"].includes(task.status));
  const openLeads = state.leads.filter((lead) => lead.assignedToMemberId === memberId && !["closed", "not_interested"].includes(lead.status));
  const priorMemory = state.memories.find((memory) => memory.memberId === memberId)?.summary || "";

  if (!hasGeminiKey()) {
    const lowered = body.toLowerCase();
    const status: TaskStatus = lowered.includes("block") ? "blocked" : lowered.includes("done") ? "done" : "in_progress";
    return {
      taskUpdates: openTasks[0] ? [{ taskId: openTasks[0].id, status, note: body }] : [],
      leadUpdates: [],
      memorySummary: priorMemory || "Member replies are being stored; AI memory needs GOOGLE_GENERATIVE_AI_API_KEY for summaries."
    };
  }

  const { output } = await generateText({
    model,
    output: Output.object({ schema: memberReplySchema }),
    system: [
      "You interpret WhatsApp replies from team members.",
      "Match replies only to the listed open tasks and leads.",
      "When unclear, leave taskId or leadId empty and include a title/name hint.",
      "Keep memory concise and useful for future follow-ups."
    ].join("\n"),
    prompt: JSON.stringify({
      currentDate: new Date().toISOString(),
      priorMemory,
      openTasks,
      openLeads,
      reply: body
    })
  });

  return output;
}

export function parseAdminMessageHeuristic(body: string): AdminIntent {
  const text = body.trim();
  const addMember = text.match(/add\s+(?:(?:member|memeber)\s+)?([a-zA-Z ]+?)\s+(whatsapp:\+?\d+|\+?\d+)(?:\s+(?:as\s+)?([a-zA-Z]+))?$/i);
  if (addMember) {
    return {
      intent: "add_member",
      targetMemberName: addMember[1].trim(),
      memberPhone: addMember[2],
      memberRole: addMember[3]?.toLowerCase()
    };
  }

  const directTask = text.match(/^(?:weekly\s+)?task\s+for\s+([a-zA-Z ]+)\s*:\s*(.+)$/i);
  if (directTask) {
    const tasks = parseTaskList(directTask[2].trim()).map((task) => ({
      memberName: directTask[1].trim(),
      title: task.title,
      deadline: task.deadline
    }));
    return {
      intent: "add_task",
      task: tasks[0],
      tasks
    };
  }

  if (/^show|who has|status|today/i.test(text)) {
    return { intent: "status_query", message: text };
  }

  const leadFor = text.match(/lead\s+for\s+([a-zA-Z ]+)[:\n]/i);
  if (leadFor) {
    const url = text.match(/https?:\/\/\S+/)?.[0];
    const phone = text.match(/(?:\+94|0)\d[\d\s-]{7,}/)?.[0];
    const website = text.match(/https?:\/\/(?!maps\.google|goo\.gl|maps\.app)\S+/)?.[0];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const businessLine = lines.find((line) => !/lead\s+for/i.test(line) && !line.startsWith("http"));
    return {
      intent: "lead_assignment",
      targetMemberName: leadFor[1].trim(),
      lead: {
        businessName: businessLine?.replace(/^business:\s*/i, ""),
        phone,
        website,
        googleMapsUrl: url,
        notes: text
      }
    };
  }

  if (/weekly|tasks|breakdown/i.test(text) || /^.+:\s*$/m.test(text)) {
    const tasks: AdminIntent["weeklyTasks"] = [];
    let currentMember = "";
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || /^weekly|tasks|breakdown/i.test(line)) continue;
      const memberMatch = line.match(/^([a-zA-Z ]+):$/);
      if (memberMatch) {
        currentMember = memberMatch[1].trim();
        continue;
      }
      if (currentMember && /^[-*]/.test(line)) {
        const parsed = parseTaskTitleAndDeadline(line.replace(/^[-*]\s*/, ""));
        tasks.push({
          memberName: currentMember,
          title: parsed.title,
          deadline: parsed.deadline
        });
      }
    }
    if (tasks.length) return { intent: "weekly_plan", weeklyTasks: tasks };
  }

  return { intent: "unknown", message: text };
}

function parseTaskTitleAndDeadline(input: string) {
  const deadlineMatch = input.match(/\bby\s+(.+)$/i);
  if (!deadlineMatch) return { title: input };

  return {
    title: input.slice(0, deadlineMatch.index).trim(),
    deadline: normalizeDeadline(deadlineMatch[1].trim())
  };
}

function parseTaskList(input: string) {
  const sharedDeadline = extractSharedDeadline(input);
  const body = sharedDeadline.title;
  const chunks = splitTaskChunks(body);
  const parsed = chunks.map((chunk) => parseTaskTitleAndDeadline(chunk));
  const tasks = parsed.map((task) => ({
    title: cleanupTaskTitle(task.title),
    deadline: task.deadline || sharedDeadline.deadline
  }));
  return tasks.filter((task) => task.title.length > 0);
}

function extractSharedDeadline(input: string) {
  const deadlineMatch = input.match(/\bby\s+(.+)$/i);
  if (!deadlineMatch) return { title: input };

  return {
    title: input.slice(0, deadlineMatch.index).trim(),
    deadline: normalizeDeadline(deadlineMatch[1].trim())
  };
}

function splitTaskChunks(input: string) {
  const numbered = input
    .split(/\s*(?:\d+[\).]|[-*])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  if (numbered.length > 1) return numbered;

  return input
    .split(/\s+(?:and\s+also|also\s+need(?:s)?\s+to|also\s+need(?:s)?|plus|,\s*and)\s+/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function cleanupTaskTitle(input: string) {
  let title = input
    .replace(/^(?:need(?:s)?\s+(?:to\s+)?|to\s+|also\s+)/i, "")
    .replace(/\b02\b/g, "2")
    .trim();

  if (/^2\s+social\s+posts?$/i.test(title)) {
    title = "design 2 social media posts";
  } else if (/^social\s+posts?$/i.test(title)) {
    title = "design social media posts";
  }

  return title;
}

function normalizeDeadline(input: string) {
  const lowered = input.toLowerCase().replace(/[^\w\s-]/g, "").trim();
  const weekday = matchWeekday(lowered);
  if (weekday !== undefined) return nextWeekdayIso(weekday);

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return undefined;
}

function matchWeekday(input: string) {
  const weekdays = [
    ["sun", "sunday"],
    ["mon", "monday"],
    ["tue", "tues", "tuesday"],
    ["wed", "weds", "wednes", "wednesday"],
    ["thu", "thur", "thurs", "thursday"],
    ["fri", "friday"],
    ["sat", "saturday"]
  ];
  return weekdays.findIndex((aliases) => aliases.includes(input));
}

function nextWeekdayIso(targetDay: number) {
  const date = new Date();
  const currentDay = date.getDay();
  const daysToAdd = (targetDay - currentDay + 7) % 7 || 7;
  date.setDate(date.getDate() + daysToAdd);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
}

export function matchStatus(input: string): TaskStatus | LeadStatus {
  const lowered = input.toLowerCase();
  if (lowered.includes("interest")) return "interested";
  if (lowered.includes("no answer")) return "no_answer";
  if (lowered.includes("follow")) return "follow_up";
  if (lowered.includes("contact")) return "contacted";
  if (lowered.includes("block")) return "blocked";
  if (lowered.includes("done") || lowered.includes("complete")) return "done";
  return "in_progress";
}
