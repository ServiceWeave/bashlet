import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wardley Map - Strategic Mapping Tool",
  description:
    "Create and edit Wardley Maps with a sketch-style canvas for strategic planning and visualization",
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
