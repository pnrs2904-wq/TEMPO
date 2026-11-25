import type { Metadata, Viewport } from "next";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "Tempo: the focus timer that adapts to your energy and subject", template: "%s · Tempo" },
  description:
    "An intelligent focus timer for UPSC, SSC, banking, GATE and university exam preparation. Tempo adapts session length to your energy, subject and actual study performance, and shows its working.",
  applicationName: "Tempo",
  keywords: ["study timer", "focus timer", "UPSC study planner", "SSC preparation", "banking exam", "GATE", "Pomodoro alternative", "adaptive study timer"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", siteName: "Tempo", locale: "en_IN", url: "/",
    title: "Tempo: the focus timer that adapts to your energy and subject",
    description: "Session lengths that follow your energy, subject and real study history. Works offline. Built for exam preparation.",
  },
  twitter: { card: "summary" },
  appleWebApp: { capable: true, title: "Tempo", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#FAF7F2" }, { media: "(prefers-color-scheme: dark)", color: "#191716" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
