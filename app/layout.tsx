import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Manager Agent",
  description: "WhatsApp-first team reminder and lead follow-up agent"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
