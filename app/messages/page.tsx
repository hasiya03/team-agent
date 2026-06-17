import { getDashboardSnapshot } from "@/lib/store";
import { MessageList, StatGrid } from "@/app/ui/dashboard-widgets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MessagesPage() {
  const data = await getDashboardSnapshot();

  return (
    <section className="main">
      <div className="page-heading">
        <div>
          <h1>Messages</h1>
          <p>Recent inbound and outbound bot conversation history.</p>
        </div>
      </div>

      <StatGrid
        stats={[
          ["Total", data.messages.length],
          ["Inbound", data.messages.filter((message) => message.direction === "inbound").length],
          ["Outbound", data.messages.filter((message) => message.direction === "outbound").length],
          ["Today", data.messages.filter((message) => isToday(message.createdAt)).length]
        ]}
      />

      <section className="panel">
        <div className="panel-header">
          <h2>Conversation Log</h2>
          <span className="subtle">{data.messages.length} messages</span>
        </div>
        <MessageList messages={data.messages} />
      </section>
    </section>
  );
}

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}
