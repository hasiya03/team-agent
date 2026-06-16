import { createClient } from "@supabase/supabase-js";
import type {
  AgentMessage,
  AppState,
  Lead,
  MemberMemory,
  PendingConfirmation,
  Reminder,
  Task,
  TeamMember
} from "@/lib/types";

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function requireData<T>(data: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  return data as T;
}

function memberFromDb(row: any): TeamMember {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    timezone: row.timezone,
    preferredReminderHour: row.preferred_reminder_hour,
    active: row.active,
    createdAt: row.created_at,
    lastReplyAt: row.last_reply_at || undefined
  };
}

function taskFromDb(row: any): Task {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    description: row.description || undefined,
    deadline: row.deadline || undefined,
    status: row.status,
    sourceMessageId: row.source_message_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function leadFromDb(row: any): Lead {
  return {
    id: row.id,
    assignedToMemberId: row.assigned_to_member_id,
    businessName: row.business_name,
    phone: row.phone || undefined,
    website: row.website || undefined,
    address: row.address || undefined,
    googleMapsUrl: row.google_maps_url || undefined,
    notes: row.notes || undefined,
    status: row.status,
    nextFollowUpAt: row.next_follow_up_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function messageFromDb(row: any): AgentMessage {
  return {
    id: row.id,
    twilioMessageSid: row.twilio_message_sid || undefined,
    from: row.from_phone,
    to: row.to_phone,
    body: row.body,
    direction: row.direction,
    memberId: row.member_id || undefined,
    createdAt: row.created_at
  };
}

function memoryFromDb(row: any): MemberMemory {
  return {
    memberId: row.member_id,
    summary: row.summary,
    updatedAt: row.updated_at
  };
}

function reminderFromDb(row: any): Reminder {
  return {
    id: row.id,
    memberId: row.member_id,
    type: row.type,
    body: row.body,
    sendAt: row.send_at,
    sentAt: row.sent_at || undefined,
    status: row.status,
    createdAt: row.created_at
  };
}

function confirmationFromDb(row: any): PendingConfirmation {
  return {
    id: row.id,
    adminPhone: row.admin_phone,
    summary: row.summary,
    payload: row.payload,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

export async function readSupabaseState(): Promise<AppState> {
  const db = client();
  const [members, tasks, leads, messages, memories, reminders, confirmations] = await Promise.all([
    db.from("team_members").select("*").order("created_at", { ascending: false }),
    db.from("tasks").select("*").order("created_at", { ascending: false }),
    db.from("leads").select("*").order("created_at", { ascending: false }),
    db.from("agent_messages").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("member_memories").select("*"),
    db.from("reminders").select("*").order("send_at", { ascending: true }),
    db.from("pending_confirmations").select("*").order("created_at", { ascending: false })
  ]);

  return {
    members: requireData(members.data, members.error).map(memberFromDb),
    tasks: requireData(tasks.data, tasks.error).map(taskFromDb),
    leads: requireData(leads.data, leads.error).map(leadFromDb),
    messages: requireData(messages.data, messages.error).map(messageFromDb),
    memories: requireData(memories.data, memories.error).map(memoryFromDb),
    reminders: requireData(reminders.data, reminders.error).map(reminderFromDb),
    confirmations: requireData(confirmations.data, confirmations.error).map(confirmationFromDb)
  };
}

export async function upsertSupabaseMember(member: TeamMember) {
  const db = client();
  const { data, error } = await db
    .from("team_members")
    .upsert({
      id: member.id,
      name: member.name,
      phone: member.phone,
      role: member.role,
      timezone: member.timezone,
      preferred_reminder_hour: member.preferredReminderHour,
      active: member.active,
      created_at: member.createdAt,
      last_reply_at: member.lastReplyAt || null
    })
    .select()
    .single();
  return memberFromDb(requireData(data, error));
}

export async function insertSupabaseMessage(message: AgentMessage) {
  const db = client();
  const { data, error } = await db
    .from("agent_messages")
    .insert({
      id: message.id,
      twilio_message_sid: message.twilioMessageSid || null,
      from_phone: message.from,
      to_phone: message.to,
      body: message.body,
      direction: message.direction,
      member_id: message.memberId || null,
      created_at: message.createdAt
    })
    .select()
    .single();
  return messageFromDb(requireData(data, error));
}

export async function insertSupabaseTasks(tasks: Task[]) {
  if (!tasks.length) return [];
  const db = client();
  const { data, error } = await db
    .from("tasks")
    .insert(
      tasks.map((task) => ({
        id: task.id,
        member_id: task.memberId,
        title: task.title,
        description: task.description || null,
        deadline: task.deadline || null,
        status: task.status,
        source_message_id: task.sourceMessageId || null,
        created_at: task.createdAt,
        updated_at: task.updatedAt
      }))
    )
    .select();
  return requireData(data, error).map(taskFromDb);
}

export async function patchSupabaseTask(task: Task) {
  const db = client();
  const { data, error } = await db
    .from("tasks")
    .update({
      description: task.description || null,
      status: task.status,
      updated_at: task.updatedAt
    })
    .eq("id", task.id)
    .select()
    .single();
  return taskFromDb(requireData(data, error));
}

export async function insertSupabaseLead(lead: Lead) {
  const db = client();
  const { data, error } = await db
    .from("leads")
    .insert({
      id: lead.id,
      assigned_to_member_id: lead.assignedToMemberId,
      business_name: lead.businessName,
      phone: lead.phone || null,
      website: lead.website || null,
      address: lead.address || null,
      google_maps_url: lead.googleMapsUrl || null,
      notes: lead.notes || null,
      status: lead.status,
      next_follow_up_at: lead.nextFollowUpAt || null,
      created_at: lead.createdAt,
      updated_at: lead.updatedAt
    })
    .select()
    .single();
  return leadFromDb(requireData(data, error));
}

export async function patchSupabaseLead(lead: Lead) {
  const db = client();
  const { data, error } = await db
    .from("leads")
    .update({
      notes: lead.notes || null,
      status: lead.status,
      next_follow_up_at: lead.nextFollowUpAt || null,
      updated_at: lead.updatedAt
    })
    .eq("id", lead.id)
    .select()
    .single();
  return leadFromDb(requireData(data, error));
}

export async function upsertSupabaseMemory(memory: MemberMemory) {
  const db = client();
  const { data, error } = await db
    .from("member_memories")
    .upsert({
      member_id: memory.memberId,
      summary: memory.summary,
      updated_at: memory.updatedAt
    })
    .select()
    .single();
  return memoryFromDb(requireData(data, error));
}

export async function insertSupabaseReminder(reminder: Reminder) {
  const db = client();
  const { data, error } = await db
    .from("reminders")
    .insert({
      id: reminder.id,
      member_id: reminder.memberId,
      type: reminder.type,
      body: reminder.body,
      send_at: reminder.sendAt,
      sent_at: reminder.sentAt || null,
      status: reminder.status,
      created_at: reminder.createdAt
    })
    .select()
    .single();
  return reminderFromDb(requireData(data, error));
}

export async function patchSupabaseReminder(reminder: Reminder) {
  const db = client();
  const { data, error } = await db
    .from("reminders")
    .update({
      sent_at: reminder.sentAt || null,
      status: reminder.status
    })
    .eq("id", reminder.id)
    .select()
    .single();
  return reminderFromDb(requireData(data, error));
}

export async function insertSupabaseConfirmation(confirmation: PendingConfirmation) {
  const db = client();
  const { data, error } = await db
    .from("pending_confirmations")
    .insert({
      id: confirmation.id,
      admin_phone: confirmation.adminPhone,
      summary: confirmation.summary,
      payload: confirmation.payload,
      created_at: confirmation.createdAt,
      expires_at: confirmation.expiresAt
    })
    .select()
    .single();
  return confirmationFromDb(requireData(data, error));
}

export async function deleteSupabaseConfirmation(id: string) {
  const db = client();
  const { error } = await db.from("pending_confirmations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
