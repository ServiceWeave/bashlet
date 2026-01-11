import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "K8s Debugger - AI-Powered Kubernetes Debugging",
  description:
    "Debug Kubernetes clusters with an AI assistant powered by Claude and bashlet",
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
