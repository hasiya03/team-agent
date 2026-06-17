import type { Metadata } from "next";
import "./globals.css";
import AdminShell from "@/app/ui/admin-shell";

export const metadata: Metadata = {
  title: "Team Manager Agent",
  description: "Telegram-first team reminder and lead follow-up agent"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
