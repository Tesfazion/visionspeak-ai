"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Loader2 } from "@/components/icons";
import { LOCALES } from "@/lib/i18n";
import { cn } from "@/components/ui";
import { useI18n } from "./locale-provider";

/**
 * Language menu.
 *
 * A listbox rather than a `<select>`: the options must show the language in its
 * own script (አማርኛ, Español, Français) alongside the English name, and a native
 * select cannot style that consistently across platforms. Keyboard: Escape
 * closes, arrow keys move between items, every row is a 44px target.
 */
export function LanguageSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { locale, option, setLocale, t, pending } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code: (typeof LOCALES)[number]["code"]) => {
    setLocale(code);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg text-mist transition-colors hover:text-ink",
          variant === "full"
            ? "min-h-11 w-full px-2 text-[14px] hover:bg-white/5"
            : "h-10 px-2",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("locale.current", { language: option.native })}
        title={t("locale.switcher")}
      >
        {pending ? <Loader2 className="size-[18px] animate-spin" /> : <Languages className="size-[18px]" />}
        <span className={variant === "full" ? "flex-1 text-left" : "hidden text-[12px] font-medium xl:inline"}>
          {option.native}
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("nav.language")}
          className={cn(
            "panel absolute z-[60] mt-1.5 w-56 overflow-hidden p-1 shadow-2xl",
            variant === "full" ? "left-0" : "right-0",
          )}
        >
          {LOCALES.map((item) => {
            const active = item.code === locale;
            return (
              <li key={item.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => choose(item.code)}
                  lang={item.htmlLang}
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] transition-colors",
                    active ? "bg-brand/15 text-ink" : "text-mist hover:bg-white/5 hover:text-ink",
                  )}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{item.native}</span>
                    <span className="text-[10.5px] text-fog">{item.label}</span>
                  </span>
                  {active && <Check className="size-3.5 shrink-0 text-brand-soft" />}
                </button>
              </li>
            );
          })}
          <li className="mt-1 border-t border-line/60 px-2.5 pb-1 pt-2 text-[10px] leading-relaxed text-fog/80">
            {t("locale.partial")}
          </li>
        </ul>
      )}
    </div>
  );
}
