import { BRAND_NAME } from "@/lib/brand";

/**
 * Structured data for the pricing page.
 *
 * Product + Offer schema so a search engine can read the plan names, prices
 * and what's included without parsing the DOM. The JSON is static — it
 * mirrors `src/lib/plans.ts`, which is the same object the API enforces, so
 * the advertised price and the enforced quota cannot drift apart.
 */
export function PricingJsonLd() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const data = {
    "@context": "https://schema.org",
    "@type": "ProductList",
    name: `${BRAND_NAME} plans`,
    item: [
      {
        "@type": "Product",
        name: "Free",
        description: "Five analysed sessions a month, 10-minute sessions, 30 days of history.",
        "@id": `${base}/pricing`,
        brand: { "@type": "Brand", name: BRAND_NAME },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${base}/signup`,
        },
      },
      {
        "@type": "Product",
        name: "Pro",
        description:
          "200 analysed sessions a month, 60-minute sessions, unlimited history, CSV and PDF export.",
        "@id": `${base}/pricing`,
        brand: { "@type": "Brand", name: BRAND_NAME },
        offers: {
          "@type": "Offer",
          price: "12",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: `${base}/pricing`,
        },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}