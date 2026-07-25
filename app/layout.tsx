import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPX — Stable launchpad",
  description: "Launch tokens on Stable. 1% trade fee · creator 80% · platform 20%.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
