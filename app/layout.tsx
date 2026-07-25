import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StableBox — Mystery Boxes on Stable",
  description: "Open SBOX mystery boxes. Win random USDT prizes on Stable Network.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
