import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPX — Stable launchpad",
  description: "Launch & trade tokens on Stable. 1% fee · creator 80% · platform 20% · grad $20k.",
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "LPX",
    description: "Stable network launchpad",
    images: ["/logo.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
