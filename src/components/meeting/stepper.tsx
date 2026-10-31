"use client";

import { cn } from "@/components/ui";
import { ArrowLeft, ArrowRight } from "@/components/icons";

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

export function Stepper({
  steps,
  value,
  onChange,
  className,
}: {
  steps: StepperStep[];
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const canPrev = value > 0;
  const canNext = value < steps.length - 1;

  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-left transition-colors",
              i === value
                ? "border-brand/50 bg-brand/10"
                : i < value
                  ? "border-line bg-white/[0.02]"
                  : "border-line/60 bg-transparent opacity-60",
            )}
          >
            <div className="text-[10px] uppercase tracking-[0.14em] text-fog">
              Step {i + 1}
            </div>
            <div className="text-[13px] font-medium text-ink">{s.label}</div>
            {s.description && (
              <p className="mt-0.5 text-[11px] text-fog">{s.description}</p>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onChange(value - 1)}
          className={cn(
            "flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-fog transition-colors",
            canPrev ? "hover:border-white/20 hover:text-ink" : "opacity-40 cursor-not-allowed",
          )}
        >
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <span className="text-[11px] text-fog">
          {value + 1} of {steps.length}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onChange(value + 1)}
          className={cn(
            "flex items-center gap-1 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-soft transition-colors",
            !canNext && "opacity-40 cursor-not-allowed",
          )}
        >
          {canNext ? "Continue" : "Done"}
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export default Stepper;