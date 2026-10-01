import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "GEI Discovery Guide — The DAM Guide",
    template: "%s · GEI Discovery Guide"
  },
  description: "The DAM Guide — Premium Investigation Experience. Don't just read Genesis. Learn how to investigate it.",
  applicationName: "GEI Discovery Guide"
};

export const viewport: Viewport = {
  themeColor: "#06070d",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${plexMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
