/**
 * The languages this build ships.
 *
 * Adding one is two steps: drop a `messages/<code>.ts` file (a partial or full
 * copy of `en.ts`), then append an entry here. Nothing else in the product
 * enumerates languages — the switcher, the `<html lang>` attribute, the
 * persistence cookie and the coverage report all read this list.
 */
export type Locale = "en" | "am" | "es" | "fr";

export interface LocaleOption {
  code: Locale;
  /** English name, used in docs and logs. */
  label: string;
  /** Endonym — what the language calls itself, shown in the switcher. */
  native: string;
  dir: "ltr" | "rtl";
  htmlLang: string;
}

export const LOCALES: LocaleOption[] = [
  { code: "en", label: "English", native: "English", dir: "ltr", htmlLang: "en" },
  { code: "am", label: "Amharic", native: "አማርኛ", dir: "ltr", htmlLang: "am" },
  { code: "es", label: "Spanish", native: "Español", dir: "ltr", htmlLang: "es" },
  { code: "fr", label: "French", native: "Français", dir: "ltr", htmlLang: "fr" },
];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie read by the server so the first paint is already in the right language. */
export const LOCALE_COOKIE = "vs_locale";

/** Mirror for the client, so a stale cookie cannot win over an explicit choice. */
export const LOCALE_STORAGE_KEY = "visionspeak:locale";

/** One year, lax: a language choice is not sensitive and must survive restarts. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((l) => l.code === value);
}

/** Accepts `es-ES`, `ES`, `fr-CA` and similar before giving up on English. */
export function resolveLocale(raw?: string | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const normalized = raw.trim().toLowerCase();
  if (isLocale(normalized)) return normalized;
  const base = normalized.split(/[-_]/)[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function localeOption(code: Locale): LocaleOption {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
