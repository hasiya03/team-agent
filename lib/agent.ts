import type { Lead, MemberRole, Task } from "@/lib/types";
import { parseAdminMessage, interpretMemberReply } from "@/lib/ai";
import {
  addConfirmation,
  addLead,
  addMember,
  addMessage,
  addReminder,
  addTasks,
  findMemberByName,
  findMemberByPhone,
  hasReminderForDay,
  markMemberReplied,
  popLatestConfirmation,
  readState,
  updateLeadStatus,
  updateTaskStatus,
  upsertMemory
} from "@/lib/store";
import { dailyCheckinMessage, leadAssignmentMessage, taskBreakdownMessage } from "@/lib/messages";
import { sendWhatsApp } from "@/lib/twilio";
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

async function handleAdminMessage(adminPhone: string, body: string) {
  if (/^confirm$/i.test(body.trim())) {
    const confirmation = await popLatestConfirmation(adminPhone);
    if (!confirmation) return "No active confirmation found.";

    const payload = confirmation.payload;

    if (payload.kind === "weekly_plan") {
      const state = await readState();
      const tasksToCreate = payload.tasks
        .map((task) => {
          const member = task.memberId
            ? state.members.find((item) => item.id === task.memberId)
            : state.members.find((item) => item.name.toLowerCase() === task.memberName.toLowerCase());
          if (!member) return undefined;
          return {
            memberId: member.id,
            title: task.title,
            deadline: task.deadline,
            description: task.description
          };
        })
        .filter(Boolean) as Array<Omit<Task, "id" | "createdAt" | "updatedAt" | "status">>;

      const created = await addTasks(tasksToCreate);
      await sendWeeklyBreakdowns(created);
      return `Confirmed. Saved ${created.length} tasks and sent each member their breakdown.`;
    }

    if (payload.kind === "broadcast") {
      const state = await readState();
      const members = state.members.filter((member) => payload.memberIds.includes(member.id));
      await Promise.all(members.map((member) => sendWhatsApp(member.phone, payload.body)));
      return `Confirmed. Sent broadcast to ${members.length} members.`;
    }
  }

  const state = await readState();
  const intent = await parseAdminMessage(body, state);

  if (intent.intent === "add_member") {
    if (!intent.targetMemberName || !intent.memberPhone) {
      return "Please send: Add member Name whatsapp:+947XXXXXXXX role";
    }
    const member = await addMember({
      name: intent.targetMemberName,
      phone: normalizePhone(intent.memberPhone),
      role: normalizeRole(intent.memberRole),
      timezone: process.env.AGENT_TIMEZONE || "Asia/Colombo",
      preferredReminderHour: 9
    });
    return `Added ${member.name} as ${member.role}.`;
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
    return summarizeStatus(await readState());
  }

  return [
    "I did not understand that admin command.",
    "",
    "Try:",
    "Add member Amal whatsapp:+947XXXXXXXX marketing",
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
  const interpretation = await interpretMemberReply(memberId, body, state);

  const updatedTasks = [];
  for (const update of interpretation.taskUpdates) {
    const task = update.taskId
      ? state.tasks.find((item) => item.id === update.taskId)
      : state.tasks.find((item) => item.memberId === memberId && item.title.toLowerCase().includes((update.taskTitleHint || "").toLowerCase()));
    if (task) {
      const updated = await updateTaskStatus(task.id, update.status, update.note);
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
    return "Got your update. I saved the message, but I could not confidently match it to a task or lead.";
  }

  return `Thanks ${member.name}. Updated ${updatedTasks.length} task(s) and ${updatedLeads.length} lead(s).`;
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

function nextReminderTime(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date;
}

function normalizeRole(role?: string): MemberRole {
  const lowered = role?.toLowerCase();
  if (lowered === "admin" || lowered === "marketing" || lowered === "operations" || lowered === "design" || lowered === "development") {
    return lowered;
  }
  return "general";
}

function summarizeStatus(state: Awaited<ReturnType<typeof readState>>) {
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
