import type { MessageKey } from "@/lib/i18n";

/**
 * One place defines how the five pillars are named and coloured. Colours are
 * theme tokens (not literals) because they end up in CSS properties — bars,
 * icons, dots — that should darken on paper the same way every other accent
 * does. They must never be handed to an SVG colour attribute.
 */
export const PILLAR_META = {
  eyeContact: { label: "metric.eyeContact" as MessageKey, color: "var(--color-mint)" },
  posture: { label: "metric.posture" as MessageKey, color: "var(--color-brand-soft)" },
  gestures: { label: "metric.gestures" as MessageKey, color: "var(--color-aqua)" },
  voice: { label: "metric.voice" as MessageKey, color: "var(--color-amber)" },
  expression: { label: "metric.expression" as MessageKey, color: "var(--color-rose)" },
} as const;

export type PillarKey = keyof typeof PILLAR_META;
export const PILLAR_KEYS = Object.keys(PILLAR_META) as PillarKey[];
