import { getDashboardSnapshot } from "@/lib/store";
import { DeadlineCalendar, StatGrid, TaskList } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TasksPage() {
  const data = await getDashboardSnapshot();
  const membersById = new Map(data.members.map((member) => [member.id, member]));
  const openTasks = data.tasks.filter((task) => !["done", "cancelled"].includes(task.status));

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Tasks</h1>
          <p>Track open work, blocked items, and deadline movement.</p>
        </div>
      </div>

      <StatGrid
        stats={[
          ["Open", openTasks.length],
          ["Blocked", data.blockedTasks.length],
          ["Overdue", data.overdueTasks.length],
          ["All Tasks", data.tasks.length]
        ]}
      />

      <DeadlineCalendar membersById={membersById} tasks={data.tasks} />

      <section className="panel">
        <div className="panel-header">
          <h2>All Tasks</h2>
          <span className="subtle">{data.tasks.length} total</span>
        </div>
        <TaskList membersById={membersById} tasks={data.tasks} />
      </section>
    </section>
  );
}
