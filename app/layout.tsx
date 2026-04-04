import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MasterBuild",
  description: "Local Browser Use command center for a 9-agent content discovery system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
