import { getDashboardSnapshot } from "@/lib/store";
import { LeadList, StatGrid } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LeadsPage() {
  const data = await getDashboardSnapshot();
  const membersById = new Map(data.members.map((member) => [member.id, member]));
  const openLeads = data.leads.filter((lead) => !["closed", "not_interested"].includes(lead.status));

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Leads</h1>
          <p>Marketing leads assigned to team members and current follow-up status.</p>
        </div>
      </div>

      <StatGrid
        stats={[
          ["Open", openLeads.length],
          ["Follow Up", data.leads.filter((lead) => lead.status === "follow_up").length],
          ["Closed", data.leads.filter((lead) => lead.status === "closed").length],
          ["All Leads", data.leads.length]
        ]}
      />

      <section className="panel">
        <div className="panel-header">
          <h2>All Leads</h2>
          <span className="subtle">{data.leads.length} saved</span>
        </div>
        <LeadList leads={data.leads} membersById={membersById} />
      </section>
    </section>
  );
}
