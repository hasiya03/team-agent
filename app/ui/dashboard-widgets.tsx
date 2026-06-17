import type { AgentMessage, Lead, Reminder, Task, TeamMember } from "@/lib/types";
import { formatDateHuman } from "@/lib/utils";

export function StatGrid({ stats }: { stats: Array<[string, number]> }) {
  return (
    <div className="stats">
      {stats.map(([label, value]) => (
        <div className="stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function MemberList({ members }: { members: TeamMember[] }) {
  return (
    <div className="list">
      {members.length ? (
        members.map((member) => (
          <article className="item" key={member.id}>
            <div className="item-row">
              <strong>{member.name}</strong>
              <span className="pill">{member.role}</span>
            </div>
            <span className="subtle">{member.phone}</span>
            <span className="subtle">Last reply: {member.lastReplyAt ? formatDateHuman(member.lastReplyAt) : "Never"}</span>
          </article>
        ))
      ) : (
        <p className="subtle">No members yet. Add one from Telegram with a natural admin message.</p>
      )}
    </div>
  );
}

export function ReminderList({ reminders, membersById }: { reminders: Reminder[]; membersById: Map<string, TeamMember> }) {
  return (
    <div className="list">
      {reminders.length ? (
        reminders.map((reminder) => (
          <article className="item" key={reminder.id}>
            <div className="item-row">
              <strong>{membersById.get(reminder.memberId)?.name || "Unknown member"}</strong>
              <span className="pill warn">{reminder.type.replace(/_/g, " ")}</span>
            </div>
            <span className="subtle">Send at {new Date(reminder.sendAt).toLocaleString()}</span>
            {reminder.body ? <p className="message-body">{reminder.body}</p> : null}
          </article>
        ))
      ) : (
        <p className="subtle">No reminders queued.</p>
      )}
    </div>
  );
}

export function TaskList({ tasks, membersById }: { tasks: Task[]; membersById: Map<string, TeamMember> }) {
  return (
    <div className="list">
      {tasks.length ? (
        tasks.map((task) => (
          <article className="item" key={task.id}>
            <div className="item-row">
              <strong>{task.title}</strong>
              <span className={`pill ${statusTone(task.status)}`}>{task.status.replace(/_/g, " ")}</span>
            </div>
            <span className="subtle">
              {membersById.get(task.memberId)?.name || "Unknown"} · {formatDateHuman(task.deadline)}
            </span>
            {task.description ? <p className="message-body">{task.description}</p> : null}
          </article>
        ))
      ) : (
        <p className="subtle">No tasks yet.</p>
      )}
    </div>
  );
}

export function LeadList({ leads, membersById }: { leads: Lead[]; membersById: Map<string, TeamMember> }) {
  return (
    <div className="list">
      {leads.length ? (
        leads.map((lead) => (
          <article className="item" key={lead.id}>
            <div className="item-row">
              <strong>{lead.businessName}</strong>
              <span className="pill">{lead.status.replace(/_/g, " ")}</span>
            </div>
            <span className="subtle">Assigned to {membersById.get(lead.assignedToMemberId)?.name || "Unknown"}</span>
            <p className="message-body">
              {[lead.phone, lead.website, lead.googleMapsUrl].filter(Boolean).join("\n") || "No contact details saved yet."}
            </p>
          </article>
        ))
      ) : (
        <p className="subtle">No leads yet.</p>
      )}
    </div>
  );
}

export function MessageList({ messages }: { messages: AgentMessage[] }) {
  return (
    <div className="list messages">
      {messages.length ? (
        messages.map((message) => (
          <article className="item" key={message.id}>
            <div className="item-row">
              <strong>{message.direction}</strong>
              <span className="subtle">{new Date(message.createdAt).toLocaleString()}</span>
            </div>
            <p className="message-body">{message.body}</p>
          </article>
        ))
      ) : (
        <p className="subtle">No messages yet.</p>
      )}
    </div>
  );
}

export function DeadlineCalendar({ tasks, membersById }: { tasks: Task[]; membersById: Map<string, TeamMember> }) {
  const calendar = buildDeadlineCalendar(tasks.filter((task) => !["done", "cancelled"].includes(task.status)));

  return (
    <section className="panel calendar-panel">
      <div className="panel-header">
        <div>
          <h2>Deadline Calendar</h2>
          <span className="subtle">{calendar.label}</span>
        </div>
      </div>
      <div className="calendar-grid">
        {calendar.weekdays.map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}
        {calendar.cells.map((cell, index) =>
          cell ? (
            <div
              className={`calendar-day ${cell.key === calendar.todayKey ? "is-today" : ""} ${cell.tasks.length ? "has-deadlines" : ""}`}
              key={cell.key}
            >
              <div className="calendar-day-number">{cell.day}</div>
              <div className="calendar-deadlines">
                {cell.tasks.slice(0, 2).map((task) => (
                  <span className={`calendar-task ${statusTone(task.status)}`} key={task.id}>
                    {membersById.get(task.memberId)?.name || "Unknown"} · {task.title}
                  </span>
                ))}
                {cell.tasks.length > 2 ? <span className="calendar-more">+{cell.tasks.length - 2} more</span> : null}
              </div>
            </div>
          ) : (
            <div className="calendar-day is-empty" key={`empty-${index}`} />
          )
        )}
      </div>
    </section>
  );
}

export function statusTone(status: Task["status"]) {
  if (status === "blocked") return "danger";
  if (status === "todo") return "warn";
  if (status === "done") return "success";
  return "";
}

function buildDeadlineCalendar(tasks: Task[]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tasksByDay = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!task.deadline) continue;
    const deadline = new Date(task.deadline);
    if (deadline.getFullYear() !== year || deadline.getMonth() !== month) continue;
    const key = dateKey(deadline);
    const grouped = tasksByDay.get(key) || [];
    grouped.push(task);
    tasksByDay.set(key, grouped);
  }

  const cells: Array<{ day: number; key: string; tasks: Task[] } | null> = [];
  for (let i = 0; i < firstDay.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    cells.push({
      day,
      key,
      tasks: (tasksByDay.get(key) || []).sort((a, b) => a.title.localeCompare(b.title))
    });
  }

  return {
    label: new Intl.DateTimeFormat("en-LK", { month: "long", year: "numeric" }).format(now),
    todayKey: dateKey(now),
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    cells
  };
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
