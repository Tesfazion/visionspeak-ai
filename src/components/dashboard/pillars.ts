import type { MessageKey } from "@/lib/i18n";

/** One place defines how the five pillars are named and coloured. */
export const PILLAR_META = {
  eyeContact: { label: "metric.eyeContact" as MessageKey, color: "#34d399" },
  posture: { label: "metric.posture" as MessageKey, color: "#a78bfa" },
  gestures: { label: "metric.gestures" as MessageKey, color: "#22d3ee" },
  voice: { label: "metric.voice" as MessageKey, color: "#fbbf24" },
  expression: { label: "metric.expression" as MessageKey, color: "#fb7185" },
} as const;

export type PillarKey = keyof typeof PILLAR_META;
export const PILLAR_KEYS = Object.keys(PILLAR_META) as PillarKey[];
