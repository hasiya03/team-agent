export type MemberRole = "admin" | "marketing" | "operations" | "design" | "development" | "general";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";

export type LeadStatus = "new" | "contacted" | "interested" | "not_interested" | "no_answer" | "follow_up" | "closed";

export type MessageDirection = "inbound" | "outbound";

export type ReminderType = "weekly_summary" | "daily_checkin" | "lead_follow_up" | "custom";

export interface TeamMember {
  id: string;
  name: string;
  phone: string;
  role: MemberRole;
  timezone: string;
  preferredReminderHour: number;
  active: boolean;
  createdAt: string;
  lastReplyAt?: string;
}

export interface Task {
  id: string;
  memberId: string;
  title: string;
  description?: string;
  deadline?: string;
  status: TaskStatus;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  assignedToMemberId: string;
  businessName: string;
  phone?: string;
  website?: string;
  address?: string;
  googleMapsUrl?: string;
  notes?: string;
  status: LeadStatus;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  twilioMessageSid?: string;
  from: string;
  to: string;
  body: string;
  direction: MessageDirection;
  memberId?: string;
  createdAt: string;
}

export interface MemberMemory {
  memberId: string;
  summary: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  memberId: string;
  type: ReminderType;
  body: string;
  sendAt: string;
  sentAt?: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
}

export interface PendingConfirmation {
  id: string;
  adminPhone: string;
  summary: string;
  payload: PendingPayload;
  createdAt: string;
  expiresAt: string;
}

export type PendingPayload =
  | {
      kind: "weekly_plan";
      tasks: Array<{
        memberName: string;
        memberId?: string;
        title: string;
        deadline?: string;
        description?: string;
      }>;
    }
  | {
      kind: "broadcast";
      memberIds: string[];
      body: string;
    }
  | {
      kind: "delete_task";
      taskId: string;
    };

export interface AppState {
  members: TeamMember[];
  tasks: Task[];
  leads: Lead[];
  messages: AgentMessage[];
  memories: MemberMemory[];
  reminders: Reminder[];
  confirmations: PendingConfirmation[];
}

export interface DashboardSnapshot extends AppState {
  overdueTasks: Task[];
  blockedTasks: Task[];
  pendingReminders: Reminder[];
}
