import { getDashboardSnapshot } from "@/lib/store";
import { MemberList, StatGrid } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembersPage() {
  const data = await getDashboardSnapshot();
  const activeMembers = data.members.filter((member) => member.active);
  const repliedToday = data.members.filter((member) => member.lastReplyAt && isToday(member.lastReplyAt));

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Members</h1>
          <p>Team profiles connected to Telegram and their latest replies.</p>
        </div>
      </div>

      <StatGrid
        stats={[
          ["Total", data.members.length],
          ["Active", activeMembers.length],
          ["Replied Today", repliedToday.length],
          ["Inactive", data.members.length - activeMembers.length]
        ]}
      />

      <section className="panel">
        <div className="panel-header">
          <h2>All Members</h2>
          <span className="subtle">{data.members.length} profiles</span>
        </div>
        <MemberList members={data.members} />
      </section>
    </section>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}
