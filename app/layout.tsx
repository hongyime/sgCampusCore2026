import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusCore",
  description: "Decentralized campus issue-reporting network for SMU.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
