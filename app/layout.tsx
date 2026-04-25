import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kanha",
  description: "Wisdom from the Bhagavad Gita, Upanishads, and the Vedic tradition",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
