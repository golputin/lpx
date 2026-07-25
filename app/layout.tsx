import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPX Arcade — Play free on Stable",
  description:
    "Free-to-play degen arcade on Stable Network. Paper Crash, leaderboards, and the LPX meme terminal. No deposit required.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
