import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Lora } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono" });
const serif = Lora({ subsets: ["latin"], variable: "--font-lora" });

export const metadata: Metadata = {
  title: "Sales Agent · Built on One",
  description: "An AI sales teammate that works in your CRM and inbox through One Connect.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
