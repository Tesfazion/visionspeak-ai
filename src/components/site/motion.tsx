"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/components/ui";

const noopSubscribe = () => () => undefined;

/**
 * Scroll-triggered reveal. CSS-only transition driven by IntersectionObserver —
 * cheaper than a motion library for the landing page's long scroll.
 *
 * When IntersectionObserver is unavailable (very old browsers, some test
 * harnesses) the content is simply shown: a reveal animation must never be the
 * reason a visitor cannot read the page. The server snapshot is `true` so the
 * first client render matches the server markup and hydration stays clean.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  const canObserve = useSyncExternalStore(
    noopSubscribe,
    () => typeof IntersectionObserver !== "undefined",
    () => true,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || !canObserve) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canObserve]);

  const visible = shown || !canObserve;

  return (
    <div
      ref={ref}
      className={cn("transition-[opacity,transform] duration-700", className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : `translate3d(0,${y}px,0)`,
        transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
