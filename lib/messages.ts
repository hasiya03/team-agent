import type { Lead, Task, TeamMember } from "@/lib/types";
import { formatDateHuman } from "@/lib/utils";

export function taskBreakdownMessage(member: TeamMember, tasks: Task[]) {
  const lines = tasks.map((task, index) => `${index + 1}. ${task.title}\n   Due: ${formatDateHuman(task.deadline)}`);
  return [
    `Good morning ${member.name}. Here is your task breakdown:`,
    "",
    lines.join("\n\n"),
    "",
    "I will check in daily. Reply with done, in progress, blocked, or a short update."
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
    "Please reply with progress, done, blocked, contacted, interested, no answer, or follow-up date."
  ]
    .filter(Boolean)
    .join("\n");
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
