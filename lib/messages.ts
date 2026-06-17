import type { Lead, Task, TeamMember } from "@/lib/types";
import { formatDateHuman } from "@/lib/utils";

export function taskBreakdownMessage(member: TeamMember, tasks: Task[]) {
  const lines = tasks.map((task, index) => `${index + 1}. ${task.title}\n   Due: ${formatDateHuman(task.deadline)}`);
  return [
    `${timeGreeting(member)} ${member.name}. Here is your task breakdown:`,
    "",
    lines.join("\n\n"),
    "",
    "I will check in daily. Reply with a short update about the work."
  ].join("\n");
}

export function dailyCheckinMessage(member: TeamMember, tasks: Task[], leads: Lead[]) {
  const taskLines = tasks.map((task, index) => `${index + 1}. ${task.title} - ${formatDateHuman(task.deadline)}`);
  const leadLines = leads.map((lead, index) => `${index + 1}. ${lead.businessName} - ${lead.status.replace(/_/g, " ")}`);

  return [
    `Daily check-in for ${member.name}:`,
    taskLines.length ? "\nTasks:\n" + taskLines.join("\n") : "",
    leadLines.length ? "\nLeads:\n" + leadLines.join("\n") : "",
    "",
    "Please reply with a short update about the work."
  ]
    .filter(Boolean)
    .join("\n");
}

function timeGreeting(member: TeamMember) {
  const timezone = member.timezone || process.env.AGENT_TIMEZONE || "Asia/Colombo";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone
    }).format(new Date())
  );

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function leadAssignmentMessage(member: TeamMember, lead: Lead) {
  return [
    `New marketing lead for ${member.name}:`,
    "",
    `Business: ${lead.businessName}`,
    `Phone: ${lead.phone || "Not available"}`,
    `Website: ${lead.website || "Not available"}`,
    lead.address ? `Address: ${lead.address}` : "",
    lead.googleMapsUrl ? `Location: ${lead.googleMapsUrl}` : "",
    lead.notes ? `Notes: ${lead.notes}` : "",
    "",
    "Please contact them and reply with contacted, interested, no answer, not interested, or follow-up date."
  ]
    .filter(Boolean)
    .join("\n");
}
