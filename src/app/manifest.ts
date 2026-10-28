import type { MetadataRoute } from "next";

/**
 * Installable PWA metadata. Icons are rasterised from `public/icons/mark.svg`
 * by `node scripts/make-icons.mjs` (part of `npm run icons`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VisionSpeak AI — public speaking coach",
    short_name: "VisionSpeak",
    description:
      "Real-time behavioural analysis of eye contact, posture, gestures, voice and expression, scored and coached on-device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#06060b",
    theme_color: "#06060b",
    categories: ["productivity", "education", "health"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Open studio", short_name: "Studio", url: "/studio" },
      { name: "Practice history", short_name: "History", url: "/dashboard" },
    ],
  };
}
