import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import EmergencyTakeover from "@/components/EmergencyTakeover";

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
      <body>
        <Providers>
          <EmergencyTakeover />
          {children}
        </Providers>
      </body>
    </html>
  );
}
