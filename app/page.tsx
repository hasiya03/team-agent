import { MessageCircle, RefreshCw, Send, Users } from "lucide-react";
import { getDashboardSnapshot } from "@/lib/store";
import { formatDateHuman } from "@/lib/utils";
import CommandTester from "@/app/ui/command-tester";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const data = await getDashboardSnapshot();
  const membersById = new Map(data.members.map((member) => [member.id, member]));

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <strong>Team Manager Agent</strong>
          <span>Telegram task reminders, marketing leads, daily updates</span>
        </div>
        <a className="button secondary" href="/api/dashboard">
          <RefreshCw size={16} />
          JSON
        </a>
      </header>

      <div className="shell">
        <aside className="sidebar">
          <h2>Admin Command Tester</h2>
          <p className="subtle">Use this before Telegram is connected. It simulates a message from the admin account.</p>
          <CommandTester />
        </aside>

        <section className="main">
          <div className="stats">
            <div className="stat">
              <span>Members</span>
              <strong>{data.members.length}</strong>
            </div>
            <div className="stat">
              <span>Open Tasks</span>
              <strong>{data.tasks.filter((task) => !["done", "cancelled"].includes(task.status)).length}</strong>
            </div>
            <div className="stat">
              <span>Open Leads</span>
              <strong>{data.leads.filter((lead) => !["closed", "not_interested"].includes(lead.status)).length}</strong>
            </div>
            <div className="stat">
              <span>Blocked</span>
              <strong>{data.blockedTasks.length}</strong>
            </div>
          </div>

          <div className="grid-two">
            <section className="panel">
              <div className="panel-header">
                <h2>Team Members</h2>
                <Users size={18} />
              </div>
              <div className="list">
                {data.members.length ? (
                  data.members.map((member) => (
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
                  <p className="subtle">No members yet. Add one with: Add member Amal telegram:123456789 marketing</p>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Pending Reminders</h2>
                <Send size={18} />
              </div>
              <div className="list">
                {data.pendingReminders.length ? (
                  data.pendingReminders.slice(0, 8).map((reminder) => (
                    <article className="item" key={reminder.id}>
                      <div className="item-row">
                        <strong>{membersById.get(reminder.memberId)?.name || "Unknown member"}</strong>
                        <span className="pill warn">{reminder.type.replace(/_/g, " ")}</span>
                      </div>
                      <span className="subtle">Send at {new Date(reminder.sendAt).toLocaleString()}</span>
                    </article>
                  ))
                ) : (
                  <p className="subtle">No reminders queued.</p>
                )}
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Tasks</h2>
            </div>
            <div className="list">
              {data.tasks.length ? (
                data.tasks.slice(0, 12).map((task) => (
                  <article className="item" key={task.id}>
                    <div className="item-row">
                      <strong>{task.title}</strong>
                      <span className={`pill ${task.status === "blocked" ? "danger" : task.status === "todo" ? "warn" : ""}`}>
                        {task.status.replace(/_/g, " ")}
                      </span>
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
          </section>

          <div className="grid-two">
            <section className="panel">
              <div className="panel-header">
                <h2>Marketing Leads</h2>
              </div>
              <div className="list">
                {data.leads.length ? (
                  data.leads.slice(0, 10).map((lead) => (
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
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>Recent Messages</h2>
                <MessageCircle size={18} />
              </div>
              <div className="list messages">
                {data.messages.length ? (
                  data.messages.slice(0, 12).map((message) => (
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
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
