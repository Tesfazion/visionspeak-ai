import Link from "next/link";
import Image from "next/image";
import { cn } from "@/components/ui";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/visionspeak-logo.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 rounded-[9px]", className)}
    />
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label={`${BRAND_NAME} home`}>
      <LogoMark size={30} className="transition-transform duration-500 group-hover:rotate-6" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {BRAND_NAME}
        </span>
        {subtitle && (
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-fog/70">
            {BRAND_TAGLINE}
          </span>
        )}
      </span>
    </Link>
  );
}
