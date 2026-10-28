import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private surfaces: an account's own data has no business in an index.
        disallow: ["/api/", "/dashboard", "/studio", "/login", "/signup", "/report/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
