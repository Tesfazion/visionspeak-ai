/**
 * Operator-configurable branding.
 *
 * `NEXT_PUBLIC_BRAND_NAME` and `NEXT_PUBLIC_BRAND_TAGLINE` let a white-label
 * deploy swap the product name and tagline without touching components. They
 * default to VisionSpeak so a self-hosted instance is honest out of the box.
 */

export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "VisionSpeak";
export const BRAND_TAGLINE = process.env.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || "Speaking intelligence";