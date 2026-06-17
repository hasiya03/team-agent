import { getDashboardSnapshot } from "@/lib/store";
import { ReminderList, StatGrid } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RemindersPage() {
  const data = await getDashboardSnapshot();
  const membersById = new Map(data.members.map((member) => [member.id, member]));

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Reminders</h1>
          <p>Queued check-ins and scheduled outbound messages.</p>
        </div>
      </div>

      <StatGrid
        stats={[
          ["Pending", data.pendingReminders.length],
          ["Sent", data.reminders.filter((reminder) => reminder.status === "sent").length],
          ["Failed", data.reminders.filter((reminder) => reminder.status === "failed").length],
          ["All", data.reminders.length]
        ]}
      />

      <section className="panel">
        <div className="panel-header">
          <h2>All Reminders</h2>
          <span className="subtle">{data.reminders.length} reminders</span>
        </div>
        <ReminderList membersById={membersById} reminders={data.reminders} />
      </section>
    </section>
  );
}
