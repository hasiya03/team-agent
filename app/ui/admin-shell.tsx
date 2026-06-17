"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, MessageCircle, Send, Users } from "lucide-react";
import RefreshButton from "@/app/ui/refresh-button";

const navItems = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/tasks", label: "Tasks", icon: CalendarDays },
  { href: "/members", label: "Members", icon: Users },
  { href: "/leads", label: "Leads", icon: Send },
  { href: "/reminders", label: "Reminders", icon: Send },
  { href: "/messages", label: "Messages", icon: MessageCircle }
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="page">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <strong>Team Manager</strong>
          <span>Agent admin</span>
        </div>
        <nav className="side-nav" aria-label="Admin sections">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={`side-nav-link ${active ? "is-active" : ""}`} href={item.href} key={item.href}>
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div className="brand">
            <strong>Team Manager Agent</strong>
            <span>Telegram task reminders, marketing leads, daily updates</span>
          </div>
          <div className="topbar-actions">
            <RefreshButton />
            <a className="button secondary" href="/api/dashboard">
              JSON
            </a>
          </div>
        </header>
        <div className="shell">{children}</div>
      </div>
    </main>
  );
}
