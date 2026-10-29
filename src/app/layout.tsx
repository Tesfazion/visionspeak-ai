import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteNav } from "@/components/site/nav";
import { LocaleProvider } from "@/components/site/locale-provider";
import { ServiceWorkerRegistrar } from "@/components/site/service-worker";
import { ThemeProvider, themeInitScript } from "@/components/site/theme";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

// Fonts are self-hosted (src/app/fonts, fetched by scripts/assets/fetch-fonts.mjs) so the build
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
    default: "VisionSpeak — Speak with presence",
    template: "%s · VisionSpeak",
  },
  description:
    "VisionSpeak is a speaking coach that measures what an audience actually feels: confidence, warmth and leadership presence, scored honestly and coached in the moment.",
  applicationName: "VisionSpeak",
  keywords: [
    "public speaking coach",
    "presentation feedback",
    "speaking practice",
    "leadership presence",
    "communication skills",
    "interview practice",
  ],
  authors: [{ name: "VisionSpeak" }],
  // opengraph-image.tsx supplies the image; twitter reuses the same card.
  twitter: {
    card: "summary_large_image",
    title: "VisionSpeak — Speak with presence",
    description:
      "Real-time feedback on eye contact, posture, gestures, voice and expression — scored honestly and coached while you speak.",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "VisionSpeak — Speak with presence",
    description:
      "Real-time feedback on eye contact, posture, gestures, voice and expression — scored honestly and coached while you speak.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06060b" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
  ],
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  // Lets the layout use env(safe-area-inset-*) on notched phones so the docked
  // studio controls are never swallowed by the home indicator.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language lives in a cookie so the server can render the first paint in
  // the chosen language. Reading it here is what makes SSR translation possible;
  // the trade-off is that marketing routes render per request too.
  const { locale, dir, htmlLang, t } = await getI18n();

  return (
    <html
      lang={htmlLang}
      dir={dir}
      className={`${inter.variable} ${jetbrains.variable} ${instrument.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        {/* Runs before first paint so a stored light theme never flashes dark. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <ThemeProvider>
          <LocaleProvider initialLocale={locale}>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-white"
            >
              {t("a11y.skip")}
            </a>
            <SiteNav />
            <main id="main">{children}</main>
            <ServiceWorkerRegistrar />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
