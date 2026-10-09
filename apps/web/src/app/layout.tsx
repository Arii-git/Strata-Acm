import type { Metadata } from "next";
import { Poppins, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "@/styles/tokens.css";
import "@/styles/tokens-v2.css";
import "@/styles/globals.css";
import "@/styles/lanes/home.css";
import "@/styles/lanes/problems.css";
import "@/styles/lanes/case.css";
import "@/styles/lanes/pages.css";
import "@/styles/lanes/help.css";
import "@/styles/lanes/a11y.css";
import { LiveRegion, SkipLink } from "@/components/ui/states";

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
      <body>
        {/* first focusable element on every page; targets <main id="main"> */}
        <SkipLink />
        {children}
        {/* polite/assertive live regions for announce() after async actions */}
        <LiveRegion />
      </body>
    </html>
  );
}
