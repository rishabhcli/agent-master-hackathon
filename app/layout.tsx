import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020408",
};

export const metadata: Metadata = {
  title: "MasterBuild — Autonomous Market Intelligence",
  description:
    "Autonomous multi-agent system that researches, validates, and builds business ideas using AI-powered market intelligence across YouTube, X, Reddit, and Substack.",
  keywords: [
    "market intelligence",
    "autonomous agents",
    "business validation",
    "AI research",
    "MasterBuild",
  ],
  openGraph: {
    title: "MasterBuild",
    description:
      "Autonomous market intelligence for rapid enterprise innovation.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
