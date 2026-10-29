"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_MAX_AGE,
  LOCALE_STORAGE_KEY,
  createTranslator,
  localeOption,
  type Locale,
  type LocaleOption,
  type Translate,
} from "@/lib/i18n";

interface LocaleContextValue {
  locale: Locale;
  option: LocaleOption;
  setLocale: (next: Locale) => void;
  t: Translate;
  dir: "ltr" | "rtl";
  pending: boolean;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  option: localeOption(DEFAULT_LOCALE),
  setLocale: () => undefined,
  t: createTranslator(DEFAULT_LOCALE),
  dir: "ltr",
  pending: false,
});

/**
 * Holds the active language for client components.
 *
 * `initialLocale` comes from the server (cookie), so the first client render
 * matches the server HTML exactly — no hydration mismatch, no English flash.
 * Changing it writes the cookie and refreshes the server tree so server-rendered
 * pages (dashboard, report, pricing) switch too, not just client components.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [pending, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setLocaleState(next);

      const option = localeOption(next);
      document.documentElement.lang = option.htmlLang;
      document.documentElement.dir = option.dir;

      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        /* private mode: the cookie is what matters */
      }
      // Readable by the server on the very next render; not sensitive, so no
      // HttpOnly and a one-year lifetime that survives a browser restart.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_MAX_AGE}; samesite=lax`;

      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  const value = useMemo<LocaleContextValue>(() => {
    const option = localeOption(locale);
    return {
      locale,
      option,
      setLocale,
      t: createTranslator(locale),
      dir: option.dir,
      pending,
    };
  }, [locale, setLocale, pending]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}

/** Every shipped language, for menus and tests. */
export const AVAILABLE_LOCALES = LOCALES;
