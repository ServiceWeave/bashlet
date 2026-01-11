import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "File Search - AI-Powered File Search & Retrieval",
  description:
    "Search and retrieve information from files using an AI assistant powered by Claude and bashlet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
