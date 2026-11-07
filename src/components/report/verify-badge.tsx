import { CircleCheck, ShieldCheck, ShieldOff } from "@/components/icons";

export type ReportIntegrity = "verified" | "unverified" | "unchecked";

const COPY: Record<ReportIntegrity, { label: string; tone: string; icon: typeof ShieldCheck }> = {
  verified: { label: "Verified", tone: "text-mint", icon: CircleCheck },
  unverified: {
    label: "Unverified — numbers may have been edited",
    tone: "text-rose",
    icon: ShieldCheck,
  },
  unchecked: { label: "Not checked", tone: "text-fog", icon: ShieldOff },
};

/**
 * Report integrity badge.
 *
 * The server builds scores from a browser-submitted aggregate, but cannot prove
 * that aggregate matches the camera/microphone signals without receiving the
 * raw media. This hash detects edits to the stored report inputs, not fabricated
 * measurements. The state is computed from the same hash the save path wrote
 * (`reportIntegrityHash`), so it renders in the first paint and works for shared
 * reports without a client-side request that could 401 into a false warning.
 */
export function ReportVerify({ state }: { state: ReportIntegrity }) {
  const { label, tone, icon: Icon } = COPY[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] ${tone}`}>
      <Icon className="size-3" /> {label}
    </span>
  );
}
