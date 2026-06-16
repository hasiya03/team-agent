import { randomUUID } from "crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

export function normalizePhone(phone: string) {
  const trimmed = phone.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

export function samePhone(a: string, b: string) {
  return normalizePhone(a).toLowerCase() === normalizePhone(b).toLowerCase();
}

export function getAdminPhone() {
  if (process.env.ADMIN_PHONE) return normalizePhone(process.env.ADMIN_PHONE);
  if (process.env.NODE_ENV !== "production") return "whatsapp:+94700000000";
  return "";
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function isDue(sendAt: string) {
  return new Date(sendAt).getTime() <= Date.now();
}

export function formatDateHuman(value?: string) {
  if (!value) return "No deadline";
  return new Intl.DateTimeFormat("en-LK", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function unique<T>(items: T[]) {
  return [...new Set(items)];
}
