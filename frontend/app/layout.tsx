import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

const title = "Veritape — Deepfake Voice Detection";
const description =
  "Upload a voice recording and let an AASIST graph-attention model tell you whether it is real or AI-generated, with confidence scores.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "deepfake detection",
    "voice spoofing",
    "AASIST",
    "audio forensics",
    "AI voice detector",
  ],
  openGraph: {
    title,
    description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
