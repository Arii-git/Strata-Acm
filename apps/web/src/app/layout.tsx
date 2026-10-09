import type { Metadata } from "next";
import { Poppins, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/tokens-v2.css";
import "@/styles/globals.css";

const poppins = Poppins({ variable: "--nf-poppins", subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const plexSans = IBM_Plex_Sans({ variable: "--nf-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const plexMono = IBM_Plex_Mono({ variable: "--nf-plex-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "STRATA",
  description: "Detect problems before they become business losses. Prototype with synthetic data.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${poppins.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
