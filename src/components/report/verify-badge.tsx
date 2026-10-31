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
 * Scores are computed in the browser and trusted by the server, so a crafted
 * POST can store any number. The badge does not stop that; it makes stored-input
 * tampering visible. The state is computed server-side by the report page from
 * the same hash the save path wrote (`reportIntegrityHash`), so it renders in the
 * first paint, works for a shared report's anonymous reader, and needs no
 * client-side request that could 401 into a false "unverified".
 */
export function ReportVerify({ state }: { state: ReportIntegrity }) {
  const { label, tone, icon: Icon } = COPY[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10.5px] ${tone}`}>
      <Icon className="size-3" /> {label}
    </span>
  );
}
