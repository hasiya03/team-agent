import { Send, Users } from "lucide-react";
import { getDashboardSnapshot } from "@/lib/store";
import { formatDateHuman } from "@/lib/utils";
import { MemberList, ReminderList, StatGrid, TaskList } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const data = await getDashboardSnapshot();
  const membersById = new Map(data.members.map((member) => [member.id, member]));
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const openLeads = data.leads.filter((lead) => !["closed", "not_interested"].includes(lead.status));

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>Live team workload, reminders, and recent task movement.</p>
        </div>
        <span className="subtle">Updated {formatDateHuman(new Date().toISOString())}</span>
      </div>

      <StatGrid
        stats={[
          ["Members", data.members.length],
          ["Open Tasks", openTasks.length],
          ["Open Leads", openLeads.length],
          ["Blocked", data.blockedTasks.length]
        ]}
      />

      <div className="grid-two">
        <section className="panel">
          <div className="panel-header">
            <h2>Team Members</h2>
            <Users size={18} />
          </div>
          <MemberList members={data.members.slice(0, 6)} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Pending Reminders</h2>
            <Send size={18} />
          </div>
          <ReminderList membersById={membersById} reminders={data.pendingReminders.slice(0, 8)} />
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Recent Tasks</h2>
          <span className="subtle">{openTasks.length} open</span>
        </div>
        <TaskList membersById={membersById} tasks={data.tasks.slice(0, 8)} />
      </section>
    </section>
  );
}
