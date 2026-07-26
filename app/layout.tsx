import type { Metadata } from "next";
import "./globals.css";
import { APP_FULL_NAME, APP_NAME, APP_TAGLINE, TWITTER_HANDLE } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_FULL_NAME} — Stable`,
  description: `${APP_FULL_NAME} on Stable. Launch & trade with Uni V3 pools. 1% fee. @${TWITTER_HANDLE}`,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: APP_FULL_NAME,
    description: `Launch tokens on Stable · @${TWITTER_HANDLE}`,
    images: [{ url: "/og.jpg", width: 1024, height: 1024, alt: APP_FULL_NAME }],
  },
  twitter: {
    card: "summary",
    title: APP_FULL_NAME,
    description: `${APP_NAME} ${APP_TAGLINE}`,
    creator: `@${TWITTER_HANDLE}`,
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
