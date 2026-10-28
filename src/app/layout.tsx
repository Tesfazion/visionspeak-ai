import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteNav } from "@/components/site/nav";
import { ServiceWorkerRegistrar } from "@/components/site/service-worker";
import "./globals.css";

// Fonts are self-hosted (src/app/fonts, fetched by scripts/fetch-fonts.mjs) so the build
// never has to reach fonts.googleapis.com — a blocked or slow CDN there fails the whole
// render, not just the typography.
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  variable: "--font-jetbrains",
  display: "swap",
});
const instrument = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic-latin.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "VisionSpeak AI — Intelligent public speaking coach",
    template: "%s · VisionSpeak AI",
  },
  description:
    "VisionSpeak AI analyses eye contact, posture, gestures, voice and expression in real time, then scores confidence, engagement and leadership presence with actionable coaching.",
  applicationName: "VisionSpeak AI",
  keywords: [
    "public speaking coach",
    "computer vision",
    "behavioural analytics",
    "presentation feedback",
    "leadership presence",
    "MediaPipe",
  ],
  authors: [{ name: "VisionSpeak AI" }],
  // opengraph-image.tsx supplies the image; twitter reuses the same card.
  twitter: {
    card: "summary_large_image",
    title: "VisionSpeak AI — Intelligent public speaking coach",
    description:
      "Real-time behavioural analytics for speakers: eye contact, posture, gestures, voice and presence, scored and coached on-device.",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "VisionSpeak AI — Intelligent public speaking coach",
    description:
      "Real-time behavioural analytics for speakers: eye contact, posture, gestures, voice and presence, scored and coached on-device.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#06060b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Lets the layout use env(safe-area-inset-*) on notched phones so the docked
  // studio controls are never swallowed by the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${instrument.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main">{children}</main>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
