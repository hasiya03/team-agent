import type { Lead, MemberRole, Task } from "@/lib/types";
import { classifyConversationMessage, interpretMemberReply, type ConversationIntent } from "@/lib/ai";
import {
  addConfirmation,
  addLead,
  addMember,
  addMessage,
  addReminder,
  addTasks,
  deleteTask,
  findMemberByName,
  findMemberByPhone,
  hasReminderForDay,
  markMemberReplied,
  popLatestConfirmation,
  readState,
  updateTask,
  updateLeadStatus,
  upsertMemory
} from "@/lib/store";
import { dailyCheckinMessage, leadAssignmentMessage, taskBreakdownMessage } from "@/lib/messages";
import { syncTasksToNotion } from "@/lib/notion";
import { sendWhatsApp } from "@/lib/twilio";
import { normalizeTelegramChatId } from "@/lib/telegram";
import { addDays, getAdminPhone, normalizePhone, nowIso, samePhone } from "@/lib/utils";

export async function handleIncomingWhatsApp(params: {
  from: string;
  to: string;
  body: string;
  twilioMessageSid?: string;
}) {
  const from = normalizePhone(params.from);
  const to = normalizePhone(params.to);
  const adminPhone = getAdminPhone();

  await addMessage({
    twilioMessageSid: params.twilioMessageSid,
    from,
    to,
    body: params.body,
    direction: "inbound"
  });

  if (samePhone(from, adminPhone)) {
    return handleAdminMessage(from, params.body);
  }

  const member = await findMemberByPhone(from);
  if (!member) {
    return "I do not recognize this number yet. Ask the admin to add you first.";
  }

  return handleMemberReply(member.id, params.body);
}

export async function handleIncomingTelegram(params: {
  chatId: string | number;
  text: string;
  messageId?: string | number;
  username?: string;
  firstName?: string;
}) {
  const from = normalizeTelegramChatId(params.chatId);
  const to = process.env.TELEGRAM_BOT_USERNAME ? `telegram:${process.env.TELEGRAM_BOT_USERNAME}` : "telegram:bot";
  const adminPhone = getAdminPhone();
  const body = params.text.trim();

  await addMessage({
    twilioMessageSid: params.messageId ? `telegram:${params.messageId}` : undefined,
    from,
    to,
    body,
    direction: "inbound"
  });

  if (/^\/(?:start|link)(?:@\w+)?(?:\s+(.+))?$/i.test(body)) {
    return handleTelegramStart(from, body, samePhone(from, adminPhone));
  }

  if (samePhone(from, adminPhone)) {
    return handleAdminMessage(from, body);
  }

  const member = await findMemberByPhone(from);
  if (!member) {
    return [
      "I do not recognize this Telegram account yet.",
      "",
      "Send /start your-name if the admin already added you by name.",
      `Or ask the admin to add you with: Add member ${params.firstName || "Name"} ${from}`
    ].join("\n");
  }

  return handleMemberReply(member.id, body);
}

async function handleTelegramStart(from: string, body: string, isAdmin: boolean) {
  const name = body.replace(/^\/(?:start|link)(?:@\w+)?/i, "").trim();

  if (isAdmin) {
    return [
      "Admin Telegram connected.",
      "",
      "You can now send normal admin messages here, like:",
      "Add member Peec telegram:123456789",
      "This week tasks for Peec:\n1. 3 signboards for Maga"
    ].join("\n");
  }

  if (!name) {
    return [
      "Welcome. I need to link this Telegram account to your team profile.",
      "",
      "Send /start your-name",
      `Or ask the admin to add you with: Add member Your Name ${from}`
    ].join("\n");
  }

  const member = await findMemberByName(name);
  if (!member) {
    return `I could not find a member named ${name}. Ask the admin to add you first.`;
  }

  const linked = await addMember({
    ...member,
    phone: from,
    active: member.active
  });

  return `Linked Telegram to ${linked.name}. You can now ask: What are my tasks?`;
}

async function handleAdminMessage(adminPhone: string, body: string) {
  const manualReminder = body.trim().match(/^(?:send\s+reminders\s+now|remind\s+(all|[a-zA-Z ]+)\s+now)$/i);
  if (manualReminder) {
    return sendManualReminders(manualReminder[1]);
  }

  if (/^confirm$/i.test(body.trim())) {
    const confirmation = await popLatestConfirmation(adminPhone);
    if (!confirmation) return "No active confirmation found.";

    const payload = confirmation.payload;

    if (payload.kind === "weekly_plan") {
      const state = await readState();
      const taskDrafts = payload.tasks
        .map((task) => {
          const member = task.memberId
            ? state.members.find((item) => item.id === task.memberId)
            : state.members.find((item) => item.name.toLowerCase() === task.memberName.toLowerCase());
          if (!member) return undefined;
          return {
            member,
            task: {
              memberId: member.id,
              title: task.title,
              deadline: task.deadline,
              description: task.description
            },
            business: task.business,
            notionTarget: task.notionTarget
          };
        })
        .filter(Boolean) as Array<{
        member: NonNullable<Awaited<ReturnType<typeof findMemberByName>>>;
        task: Omit<Task, "id" | "createdAt" | "updatedAt" | "status">;
        business?: string;
        notionTarget?: "content" | "dev" | "job" | "meeting";
      }>;

      const created = await addTasks(taskDrafts.map((item) => item.task));
      await syncTasksToNotion(
        created.map((task, index) => ({
          task,
          member: taskDrafts[index]?.member,
          business: taskDrafts[index]?.business,
          notionTarget: taskDrafts[index]?.notionTarget,
          sourceText: confirmation.summary
        }))
      );
      await sendWeeklyBreakdowns(created);
      return `Confirmed. Saved ${created.length} tasks and sent each member their breakdown.`;
    }

    if (payload.kind === "broadcast") {
      const state = await readState();
      const members = state.members.filter((member) => payload.memberIds.includes(member.id));
      await Promise.all(members.map((member) => sendWhatsApp(member.phone, payload.body)));
      return `Confirmed. Sent broadcast to ${members.length} members.`;
    }

    if (payload.kind === "delete_task") {
      const state = await readState();
      const task = state.tasks.find((item) => item.id === payload.taskId);
      const member = task ? state.members.find((item) => item.id === task.memberId) : undefined;
      const deleted = await deleteTask(payload.taskId);
      if (!deleted) return "I could not find that task anymore.";
      if (member) {
        await sendWhatsApp(member.phone, `This task was removed:\n${deleted.title}`);
      }
      return `Removed task: ${deleted.title}${member ? ` from ${member.name}` : ""}.`;
    }
  }

  if (/^cancel$/i.test(body.trim())) {
    const confirmation = await popLatestConfirmation(adminPhone);
    return confirmation ? "Cancelled the pending action." : "No active confirmation found.";
  }

  const state = await readState();
  const intent = await classifyConversationMessage({ senderRole: "admin", body, state });

  if (intent.intent === "add_member") {
    if (!intent.targetMemberName) {
      return "Please include the member name. Example: Add member Hasiya";
    }
    const pendingContact = `pending:${intent.targetMemberName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const member = await addMember({
      name: intent.targetMemberName,
      phone: intent.memberPhone ? normalizePhone(intent.memberPhone) : pendingContact,
      role: normalizeRole(intent.memberRole),
      timezone: process.env.AGENT_TIMEZONE || "Asia/Colombo",
      preferredReminderHour: 9
    });
    if (!intent.memberPhone) {
      return `Added ${member.name}. Ask them to open this Telegram bot and send:\n/start ${member.name}`;
    }
    return `Added ${member.name}.`;
  }

  if (intent.intent === "add_task" && (intent.tasks?.length || intent.task)) {
    const taskItems = intent.tasks?.length ? intent.tasks : intent.task ? [intent.task] : [];
    const memberName = taskItems[0]?.memberName;
    if (!memberName) return "Please include who the task is for.";

    const member = await findMemberByName(memberName);
    if (!member) {
      return `I could not find a member named ${memberName}. Add them first with: Add ${memberName} whatsapp:+947XXXXXXXX`;
    }

    const tasks = await addTasks(
      taskItems.map((taskItem) => ({
        memberId: member.id,
        title: taskItem.title,
        deadline: taskItem.deadline,
        description: taskItem.description
      }))
    );

    await syncTasksToNotion(
      tasks.map((task, index) => ({
        task,
        member,
        business: taskItems[index]?.business,
        notionTarget: taskItems[index]?.notionTarget,
        sourceText: body
      }))
    );

    await sendWhatsApp(member.phone, taskBreakdownMessage(member, tasks));

    return [
      `Saved ${tasks.length} task(s) for ${member.name}.`,
      ...tasks.map((task, index) => {
        const deadline = task.deadline
          ? new Date(task.deadline).toLocaleDateString("en-LK", { weekday: "long", month: "short", day: "numeric" })
          : "not set";
        return `${index + 1}. ${task.title} - ${deadline}`;
      }),
      "I also sent the task breakdown to the member."
    ].join("\n");
  }

  if (intent.intent === "weekly_plan" && intent.weeklyTasks?.length) {
    const enriched = await Promise.all(
      intent.weeklyTasks.map(async (task) => {
        const member = await findMemberByName(task.memberName);
        return {
          ...task,
          memberId: member?.id
        };
      })
    );

    const unmatched = enriched.filter((task) => !task.memberId).map((task) => task.memberName);
    const matched = enriched.filter((task) => task.memberId);

    if (!matched.length) {
      return `I found tasks, but none of the member names match the team list. Add members first. Unmatched: ${[...new Set(unmatched)].join(", ")}`;
    }

    const summary = [
      "I found this weekly plan:",
      "",
      ...matched.map((task, index) => `${index + 1}. ${task.memberName}: ${task.title}${task.deadline ? ` - due ${task.deadline}` : ""}`),
      unmatched.length ? `\nNeeds member setup: ${[...new Set(unmatched)].join(", ")}` : "",
      "",
      "Reply CONFIRM to save and send these task breakdowns."
    ]
      .filter(Boolean)
      .join("\n");

    await addConfirmation({
      adminPhone,
      summary,
      expiresAt: addDays(new Date(), 1).toISOString(),
      payload: {
        kind: "weekly_plan",
        tasks: matched
      }
    });
    return summary;
  }

  if (intent.intent === "lead_assignment" && intent.targetMemberName) {
    const member = await findMemberByName(intent.targetMemberName);
    if (!member) return `I could not find a member named ${intent.targetMemberName}. Add the member first.`;
    const lead = await addLead({
      assignedToMemberId: member.id,
      businessName: intent.lead?.businessName || "Unnamed lead",
      phone: intent.lead?.phone,
      website: intent.lead?.website,
      address: intent.lead?.address,
      googleMapsUrl: intent.lead?.googleMapsUrl,
      notes: intent.lead?.notes || body
    });
    await sendWhatsApp(member.phone, leadAssignmentMessage(member, lead));
    return `Created lead "${lead.businessName}" and sent it to ${member.name}.`;
  }

  if (intent.intent === "status_query") {
    return summarizeStatus(await readState(), body);
  }

  if (intent.intent === "list_open_tasks") {
    return listOpenTasks(await readState());
  }

  if (intent.intent === "list_member_tasks") {
    return listMemberTasks(await readState(), intent.targetMemberName);
  }

  if (intent.intent === "send_reminder") {
    return sendManualReminders(intent.targetMemberName || "all");
  }

  if (intent.intent === "get_member_latest_reply") {
    return latestMemberReply(await readState(), intent.targetMemberName);
  }

  if (intent.intent === "set_task_deadline") {
    return setTaskDeadline(await readState(), intent);
  }

  if (intent.intent === "delete_task") {
    return confirmTaskDeletion(adminPhone, await readState(), intent);
  }

  return [
    "I did not understand that admin command.",
    "",
    "Try:",
    "Add Amal whatsapp:+947XXXXXXXX",
    "Weekly task for Amal: Contact 5 leads by Friday",
    "Weekly tasks: ...",
    "Lead for Amal: ...",
    "Show today"
  ].join("\n");
}

async function handleMemberReply(memberId: string, body: string) {
  const state = await readState();
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return "Member not found.";

  await markMemberReplied(memberId);
  const intent = await classifyConversationMessage({ senderRole: "member", body, state, memberId });

  if (intent.intent === "list_my_tasks") {
    return remainingWorkMessage(memberId);
  }

  if (intent.intent !== "member_status_update" && intent.intent !== "unknown") {
    return remainingWorkMessage(memberId);
  }

  const interpretation = await interpretMemberReply(memberId, body, state);

  const updatedTasks = [];
  for (const update of interpretation.taskUpdates) {
    const task = update.taskId
      ? state.tasks.find((item) => item.id === update.taskId)
      : state.tasks.find((item) => item.memberId === memberId && item.title.toLowerCase().includes((update.taskTitleHint || "").toLowerCase()));
    if (task) {
      const updated = await applyMemberTaskUpdate(task, {
        status: update.status,
        deadline: update.deadline,
        note: update.note || body,
        memberName: member.name
      });
      if (updated) updatedTasks.push(updated);
    }
  }

  const updatedLeads = [];
  for (const update of interpretation.leadUpdates) {
    const lead = update.leadId
      ? state.leads.find((item) => item.id === update.leadId)
      : state.leads.find((item) => item.assignedToMemberId === memberId && item.businessName.toLowerCase().includes((update.leadNameHint || "").toLowerCase()));
    if (lead) {
      const updated = await updateLeadStatus(lead.id, update.status, update.note);
      if (updated) updatedLeads.push(updated);
    }
  }

  await upsertMemory({
    memberId,
    summary: interpretation.memorySummary,
    updatedAt: nowIso()
  });

  if (!updatedTasks.length && !updatedLeads.length) {
    return [
      "Got your update. I saved the message, but I could not confidently match it to a task or lead.",
      "",
      await remainingWorkMessage(memberId)
    ].join("\n");
  }

  const updateParts = [];
  if (updatedTasks.length) updateParts.push(`${updatedTasks.length} task update(s)`);
  if (updatedLeads.length) updateParts.push(`${updatedLeads.length} lead update(s)`);

  return [
    `Thanks ${member.name}. Saved ${updateParts.join(" and ")}.`,
    "",
    await remainingWorkMessage(memberId)
  ].join("\n");
}

async function applyMemberTaskUpdate(
  task: Task,
  update: {
    status?: Task["status"];
    deadline?: string;
    note: string;
    memberName: string;
  }
) {
  const oldDeadline = task.deadline;
  const description = [task.description, `Update: ${update.note}`].filter(Boolean).join("\n");
  const updated = await updateTask(task.id, {
    description,
    status: update.status,
    deadline: update.deadline
  });

  if (updated && update.deadline && !sameDate(oldDeadline, update.deadline)) {
    await notifyAdminDeadlineChange({
      memberName: update.memberName,
      taskTitle: task.title,
      oldDeadline,
      newDeadline: update.deadline,
      note: update.note
    });
  }

  return updated;
}

async function notifyAdminDeadlineChange(params: {
  memberName: string;
  taskTitle: string;
  oldDeadline?: string;
  newDeadline: string;
  note: string;
}) {
  const adminPhone = getAdminPhone();
  if (!adminPhone) return;

  await sendWhatsApp(
    adminPhone,
    [
      "Deadline changed by member:",
      `${params.memberName} - ${params.taskTitle}`,
      `Old due: ${formatDate(params.oldDeadline)}`,
      `New due: ${formatDate(params.newDeadline)}`,
      `Update: ${params.note}`
    ].join("\n")
  );
}

function sameDate(a?: string, b?: string) {
  if (!a || !b) return a === b;
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

async function sendWeeklyBreakdowns(createdTasks: Task[]) {
  const state = await readState();
  const memberIds = [...new Set(createdTasks.map((task) => task.memberId))];
  for (const memberId of memberIds) {
    const member = state.members.find((item) => item.id === memberId);
    if (!member) continue;
    const tasks = createdTasks.filter((task) => task.memberId === memberId);
    await sendWhatsApp(member.phone, taskBreakdownMessage(member, tasks));
    await addReminder({
      memberId: member.id,
      type: "daily_checkin",
      body: dailyCheckinMessage(member, tasks, []),
      sendAt: nextReminderTime(member.preferredReminderHour).toISOString()
    });
  }
}

export async function buildDailyReminders() {
  const state = await readState();
  const created = [];
  for (const member of state.members.filter((item) => item.active && item.role !== "admin")) {
    const tasks = state.tasks.filter((task) => task.memberId === member.id && !["done", "cancelled"].includes(task.status));
    const leads = state.leads.filter((lead) => lead.assignedToMemberId === member.id && !["closed", "not_interested"].includes(lead.status));
    if (!tasks.length && !leads.length) continue;
    const sendAt = nextReminderTime(member.preferredReminderHour);
    if (await hasReminderForDay(member.id, "daily_checkin", sendAt)) continue;
    const reminder = await addReminder({
      memberId: member.id,
      type: "daily_checkin",
      body: dailyCheckinMessage(member, tasks, leads),
      sendAt: sendAt.toISOString()
    });
    created.push(reminder);
  }
  return created;
}

async function sendManualReminders(target?: string) {
  const state = await readState();
  const normalizedTarget = target?.trim().toLowerCase();
  const members = state.members.filter((member) => {
    if (!member.active || member.role === "admin") return false;
    if (!normalizedTarget || normalizedTarget === "all") return true;
    return member.name.toLowerCase() === normalizedTarget || member.name.toLowerCase().includes(normalizedTarget);
  });

  if (!members.length) {
    return normalizedTarget && normalizedTarget !== "all"
      ? `I could not find an active member matching "${target}".`
      : "No active team members found.";
  }

  const sentTo = [];
  const skipped = [];

  for (const member of members) {
    const tasks = state.tasks.filter((task) => task.memberId === member.id && !["done", "cancelled"].includes(task.status));
    const leads = state.leads.filter((lead) => lead.assignedToMemberId === member.id && !["closed", "not_interested"].includes(lead.status));
    if (!tasks.length && !leads.length) {
      skipped.push(member.name);
      continue;
    }
    await sendWhatsApp(member.phone, dailyCheckinMessage(member, tasks, leads));
    sentTo.push(member.name);
  }

  return [
    sentTo.length ? `Sent reminders to: ${sentTo.join(", ")}.` : "No reminders sent.",
    skipped.length ? `Skipped with no open work: ${skipped.join(", ")}.` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function remainingWorkMessage(memberId: string) {
  const state = await readState();
  const tasks = state.tasks.filter((task) => task.memberId === memberId && !["done", "cancelled"].includes(task.status));
  const leads = state.leads.filter((lead) => lead.assignedToMemberId === memberId && !["closed", "not_interested"].includes(lead.status));

  if (!tasks.length && !leads.length) {
    return "You have no remaining open tasks or leads right now.";
  }

  const lines = ["Remaining work for this week:"];

  if (tasks.length) {
    lines.push("");
    lines.push("Tasks:");
    lines.push(...tasks.map((task, index) => `${index + 1}. ${task.title} - ${task.status.replace(/_/g, " ")} - Due: ${formatDate(task.deadline)}`));
  }

  if (leads.length) {
    lines.push("");
    lines.push("Leads:");
    lines.push(...leads.map((lead, index) => `${index + 1}. ${lead.businessName} - ${lead.status.replace(/_/g, " ")}`));
  }

  return lines.join("\n");
}

function nextReminderTime(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date;
}

function normalizeRole(role?: string): MemberRole {
  const lowered = role?.toLowerCase();
  if (lowered === "developer") return "development";
  if (lowered === "admin" || lowered === "marketing" || lowered === "operations" || lowered === "design" || lowered === "development") {
    return lowered;
  }
  return "general";
}

function summarizeStatus(state: Awaited<ReturnType<typeof readState>>, query = "") {
  if (/daily|summary|update/i.test(query)) {
    return dailyAdminSummary(state);
  }

  const openTasks = state.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const blocked = openTasks.filter((task) => task.status === "blocked");
  const openLeads = state.leads.filter((lead) => !["closed", "not_interested"].includes(lead.status));
  const today = new Date().toISOString().slice(0, 10);
  const repliedToday = state.members.filter((member) => member.lastReplyAt?.startsWith(today)).map((member) => member.name);

  return [
    "Team status:",
    `Open tasks: ${openTasks.length}`,
    `Blocked tasks: ${blocked.length}`,
    `Open leads: ${openLeads.length}`,
    `Replied today: ${repliedToday.length ? repliedToday.join(", ") : "Nobody yet"}`
  ].join("\n");
}

function listOpenTasks(state: Awaited<ReturnType<typeof readState>>) {
  const openTasks = state.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  if (!openTasks.length) return "There are no open tasks right now.";

  return [
    "Open tasks:",
    ...openTasks.map((task, index) => {
      const member = state.members.find((item) => item.id === task.memberId);
      return `${index + 1}. ${member?.name || "Unknown"} - ${task.title} - ${task.status.replace(/_/g, " ")}${formatDeadline(task.deadline)}`;
    })
  ].join("\n");
}

function listMemberTasks(state: Awaited<ReturnType<typeof readState>>, memberName?: string) {
  if (!memberName) return "Which member should I show tasks for?";
  const member = findMemberInState(state, memberName);
  if (!member) return `I could not find a member named ${memberName}.`;

  const tasks = state.tasks.filter((task) => task.memberId === member.id && !["done", "cancelled"].includes(task.status));
  if (!tasks.length) return `${member.name} has no open tasks right now.`;

  return [
    `${member.name}'s open tasks:`,
    ...tasks.map((task, index) => `${index + 1}. ${task.title} - ${task.status.replace(/_/g, " ")}${formatDeadline(task.deadline)}`)
  ].join("\n");
}

function latestMemberReply(state: Awaited<ReturnType<typeof readState>>, memberName?: string) {
  if (!memberName) return "Which member's latest reply should I check?";
  const member = findMemberInState(state, memberName);
  if (!member) return `I could not find a member named ${memberName}.`;

  const latestReply = state.messages.find((message) => message.direction === "inbound" && samePhone(message.from, member.phone));
  if (!latestReply) return `No reply received from ${member.name} yet.`;
  return [`Latest reply from ${member.name}:`, latestReply.body].join("\n");
}

async function setTaskDeadline(state: Awaited<ReturnType<typeof readState>>, intent: ConversationIntent) {
  if (!intent.deadline) return "What deadline should I set?";

  const task = findSingleTask(state, intent);
  if (Array.isArray(task)) {
    return [
      "I found multiple matching tasks. Which one do you mean?",
      ...task.map((item, index) => {
        const member = state.members.find((memberItem) => memberItem.id === item.memberId);
        return `${index + 1}. ${member?.name || "Unknown"} - ${item.title}${formatDeadline(item.deadline)}`;
      })
    ].join("\n");
  }

  if (!task) return "I could not find the task to update. Try naming the member and part of the task.";

  const updated = await updateTask(task.id, { deadline: intent.deadline });
  if (!updated) return "I could not update that task.";

  const member = state.members.find((item) => item.id === updated.memberId);
  if (member) {
    await sendWhatsApp(member.phone, `Deadline updated:\n${updated.title}\nDue: ${formatDate(updated.deadline)}`);
  }

  return `Deadline updated: ${member?.name || "Unknown"} - ${updated.title}\nDue: ${formatDate(updated.deadline)}`;
}

async function confirmTaskDeletion(adminPhone: string, state: Awaited<ReturnType<typeof readState>>, intent: ConversationIntent) {
  const task = findSingleTask(state, intent);
  if (Array.isArray(task)) {
    return [
      "I found multiple matching tasks. Which one should be removed?",
      ...task.map((item, index) => {
        const member = state.members.find((memberItem) => memberItem.id === item.memberId);
        return `${index + 1}. ${member?.name || "Unknown"} - ${item.title}${formatDeadline(item.deadline)}`;
      })
    ].join("\n");
  }

  if (!task) return "I could not find the task to remove. Try naming the member and part of the task.";

  const member = state.members.find((item) => item.id === task.memberId);
  const summary = [
    "Remove this task?",
    "",
    `${member?.name || "Unknown"} - ${task.title}`,
    `Status: ${task.status.replace(/_/g, " ")}`,
    `Due: ${formatDate(task.deadline)}`,
    "",
    "Reply CONFIRM to remove it, or CANCEL."
  ].join("\n");

  await addConfirmation({
    adminPhone,
    summary,
    expiresAt: addDays(new Date(), 1).toISOString(),
    payload: {
      kind: "delete_task",
      taskId: task.id
    }
  });

  return summary;
}

function findSingleTask(state: Awaited<ReturnType<typeof readState>>, intent: ConversationIntent) {
  const openTasks = state.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  if (intent.taskId) return openTasks.find((task) => task.id === intent.taskId);

  const member = intent.targetMemberName ? findMemberInState(state, intent.targetMemberName) : undefined;
  const hint = (intent.taskTitleHint || intent.task?.title || intent.message || "").toLowerCase();
  const candidates = openTasks.filter((task) => {
    if (member && task.memberId !== member.id) return false;
    if (!hint) return true;
    return task.title.toLowerCase().includes(hint) || hint.includes(task.title.toLowerCase());
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) return candidates.slice(0, 5);
  return undefined;
}

function findMemberInState(state: Awaited<ReturnType<typeof readState>>, name: string) {
  const normalized = name.trim().toLowerCase();
  return state.members.find((member) => member.name.toLowerCase() === normalized) || state.members.find((member) => member.name.toLowerCase().includes(normalized));
}

function formatDeadline(deadline?: string) {
  return deadline ? ` - Due: ${formatDate(deadline)}` : "";
}

function formatDate(value?: string) {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-LK", { weekday: "long", month: "short", day: "numeric" });
}

function dailyAdminSummary(state: Awaited<ReturnType<typeof readState>>) {
  const today = new Date().toISOString().slice(0, 10);
  const members = state.members.filter((member) => member.active && member.role !== "admin");
  const lines = [`Daily update summary - ${today}`];
  const noReplyToday: string[] = [];

  for (const member of members) {
    const memberTasks = state.tasks.filter((task) => task.memberId === member.id);
    const openTasks = memberTasks.filter((task) => !["done", "cancelled"].includes(task.status));
    const doneTasks = memberTasks.filter((task) => task.status === "done");
    const blockedTasks = memberTasks.filter((task) => task.status === "blocked");
    const memberLeads = state.leads.filter((lead) => lead.assignedToMemberId === member.id && !["closed"].includes(lead.status));
    const latestReply = state.messages.find((message) => {
      return message.direction === "inbound" && message.from.toLowerCase() === member.phone.toLowerCase();
    });
    const repliedToday = Boolean(member.lastReplyAt?.startsWith(today));
    if (!repliedToday) noReplyToday.push(member.name);

    lines.push("");
    lines.push(`${member.name}${repliedToday ? " - replied today" : " - no reply today"}`);
    lines.push(`Open: ${openTasks.length} | Done: ${doneTasks.length} | Blocked: ${blockedTasks.length} | Leads: ${memberLeads.length}`);

    if (openTasks.length) {
      lines.push("Open tasks:");
      lines.push(...openTasks.slice(0, 5).map((task, index) => `${index + 1}. ${task.title} - ${task.status.replace(/_/g, " ")}`));
      if (openTasks.length > 5) lines.push(`+${openTasks.length - 5} more open task(s)`);
    }

    if (blockedTasks.length) {
      lines.push("Blocked:");
      lines.push(...blockedTasks.slice(0, 3).map((task, index) => `${index + 1}. ${task.title}`));
    }

    if (memberLeads.length) {
      const leadSummary = memberLeads.reduce<Record<string, number>>((counts, lead) => {
        counts[lead.status] = (counts[lead.status] || 0) + 1;
        return counts;
      }, {});
      lines.push(
        `Lead status: ${Object.entries(leadSummary)
          .map(([status, count]) => `${status.replace(/_/g, " ")} ${count}`)
          .join(", ")}`
      );
    }

    if (latestReply) {
      lines.push(`Latest reply: ${latestReply.body.slice(0, 180)}${latestReply.body.length > 180 ? "..." : ""}`);
    }
  }

  lines.push("");
  lines.push(noReplyToday.length ? `No reply today: ${noReplyToday.join(", ")}` : "Everyone has replied today.");

  return lines.join("\n");
}
