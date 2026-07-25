import type { Metadata } from "next";
import "./globals.css";
import { APP_FULL_NAME, APP_NAME, APP_TAGLINE, TWITTER_HANDLE } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_FULL_NAME} — Stable`,
  description: `${APP_FULL_NAME} on Stable. Launch & trade with Uni V3 pools. 1% fee. @${TWITTER_HANDLE}`,
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: APP_FULL_NAME,
    description: `Launch tokens on Stable · @${TWITTER_HANDLE}`,
    images: ["/logo.svg"],
  },
  twitter: {
    card: "summary",
    title: APP_FULL_NAME,
    description: `${APP_NAME} ${APP_TAGLINE}`,
    creator: `@${TWITTER_HANDLE}`,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
