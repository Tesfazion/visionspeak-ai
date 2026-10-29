import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // The one public report is a marketing page; every other report is a
        // person's data. Google resolves by most-specific match, so the more
        // specific allow wins over the `/report/` disallow.
        allow: ["/", "/report/demo", "/pricing", "/privacy", "/terms"],
        disallow: ["/api/", "/dashboard", "/studio", "/login", "/signup", "/report/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
