import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type {
  AgentMessage,
  AppState,
  DashboardSnapshot,
  Lead,
  MemberMemory,
  PendingConfirmation,
  Reminder,
  Task,
  TeamMember
} from "@/lib/types";
import { createId, isDue, nowIso, samePhone, startOfToday } from "@/lib/utils";

const dataDir = process.env.DATA_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "team-manager-agent") : path.join(process.cwd(), ".data"));
const dataFile = path.join(dataDir, "team-manager.json");

const emptyState: AppState = {
  members: [],
  tasks: [],
  leads: [],
  messages: [],
  memories: [],
  reminders: [],
  confirmations: []
};

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(emptyState, null, 2));
  }
}

export async function readState(): Promise<AppState> {
  await ensureDataFile();
  const raw = await readFile(dataFile, "utf8");
  return { ...emptyState, ...JSON.parse(raw) } as AppState;
}

export async function writeState(state: AppState) {
  await ensureDataFile();
  await writeFile(dataFile, JSON.stringify(state, null, 2));
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const state = await readState();
  const today = startOfToday().getTime();
  return {
    ...state,
    overdueTasks: state.tasks.filter((task) => {
      return task.deadline && new Date(task.deadline).getTime() < today && !["done", "cancelled"].includes(task.status);
    }),
    blockedTasks: state.tasks.filter((task) => task.status === "blocked"),
    pendingReminders: state.reminders.filter((reminder) => reminder.status === "pending")
  };
}

export async function addMember(input: Omit<TeamMember, "id" | "createdAt" | "active"> & { active?: boolean }) {
  const state = await readState();
  const existing = state.members.find((member) => samePhone(member.phone, input.phone) || member.name.toLowerCase() === input.name.toLowerCase());
  if (existing) {
    Object.assign(existing, input, { active: input.active ?? existing.active });
    await writeState(state);
    return existing;
  }

  const member: TeamMember = {
    id: createId("mem"),
    active: input.active ?? true,
    createdAt: nowIso(),
    ...input
  };
  state.members.push(member);
  await writeState(state);
  return member;
}

export async function findMemberByPhone(phone: string) {
  const state = await readState();
  return state.members.find((member) => samePhone(member.phone, phone));
}

export async function findMemberByName(name: string) {
  const state = await readState();
  const lowered = name.toLowerCase().trim();
  return state.members.find((member) => member.name.toLowerCase() === lowered || member.name.toLowerCase().includes(lowered));
}

export async function markMemberReplied(memberId: string) {
  const state = await readState();
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return undefined;
  member.lastReplyAt = nowIso();
  await writeState(state);
  return member;
}

export async function addMessage(message: Omit<AgentMessage, "id" | "createdAt">) {
  const state = await readState();
  const stored: AgentMessage = {
    id: createId("msg"),
    createdAt: nowIso(),
    ...message
  };
  state.messages.unshift(stored);
  state.messages = state.messages.slice(0, 500);
  await writeState(state);
  return stored;
}

export async function addTasks(tasks: Array<Omit<Task, "id" | "createdAt" | "updatedAt" | "status"> & { status?: Task["status"] }>) {
  const state = await readState();
  const created = tasks.map((task) => ({
    id: createId("task"),
    status: task.status ?? "todo",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...task
  }));
  state.tasks.unshift(...created);
  await writeState(state);
  return created;
}

export async function updateTaskStatus(taskId: string, status: Task["status"], note?: string) {
  const state = await readState();
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return undefined;
  task.status = status;
  task.updatedAt = nowIso();
  if (note) task.description = [task.description, `Update: ${note}`].filter(Boolean).join("\n");
  await writeState(state);
  return task;
}

export async function addLead(lead: Omit<Lead, "id" | "createdAt" | "updatedAt" | "status"> & { status?: Lead["status"] }) {
  const state = await readState();
  const stored: Lead = {
    id: createId("lead"),
    status: lead.status ?? "new",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...lead
  };
  state.leads.unshift(stored);
  await writeState(state);
  return stored;
}

export async function updateLeadStatus(leadId: string, status: Lead["status"], note?: string) {
  const state = await readState();
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return undefined;
  lead.status = status;
  lead.updatedAt = nowIso();
  if (note) lead.notes = [lead.notes, `Update: ${note}`].filter(Boolean).join("\n");
  await writeState(state);
  return lead;
}

export async function upsertMemory(memory: MemberMemory) {
  const state = await readState();
  const existing = state.memories.find((item) => item.memberId === memory.memberId);
  if (existing) {
    existing.summary = memory.summary;
    existing.updatedAt = memory.updatedAt;
  } else {
    state.memories.push(memory);
  }
  await writeState(state);
}

export async function addReminder(reminder: Omit<Reminder, "id" | "createdAt" | "status"> & { status?: Reminder["status"] }) {
  const state = await readState();
  const stored: Reminder = {
    id: createId("rem"),
    createdAt: nowIso(),
    status: reminder.status ?? "pending",
    ...reminder
  };
  state.reminders.push(stored);
  await writeState(state);
  return stored;
}

export async function hasReminderForDay(memberId: string, type: Reminder["type"], date: Date) {
  const state = await readState();
  const day = date.toISOString().slice(0, 10);
  return state.reminders.some((reminder) => {
    return reminder.memberId === memberId && reminder.type === type && reminder.sendAt.slice(0, 10) === day && reminder.status !== "failed";
  });
}

export async function getDueReminders(limit = 20) {
  const state = await readState();
  return state.reminders.filter((reminder) => reminder.status === "pending" && isDue(reminder.sendAt)).slice(0, limit);
}

export async function markReminderSent(reminderId: string, sent = true) {
  const state = await readState();
  const reminder = state.reminders.find((item) => item.id === reminderId);
  if (!reminder) return;
  reminder.status = sent ? "sent" : "failed";
  reminder.sentAt = nowIso();
  await writeState(state);
}

export async function addConfirmation(confirmation: Omit<PendingConfirmation, "id" | "createdAt">) {
  const state = await readState();
  const stored: PendingConfirmation = {
    id: createId("confirm"),
    createdAt: nowIso(),
    ...confirmation
  };
  state.confirmations = state.confirmations.filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  state.confirmations.unshift(stored);
  await writeState(state);
  return stored;
}

export async function popLatestConfirmation(adminPhone: string) {
  const state = await readState();
  const index = state.confirmations.findIndex((item) => samePhone(item.adminPhone, adminPhone) && new Date(item.expiresAt).getTime() > Date.now());
  if (index < 0) return undefined;
  const [confirmation] = state.confirmations.splice(index, 1);
  await writeState(state);
  return confirmation;
}
