import { am } from "./messages/am";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { DEFAULT_LOCALE, type Locale } from "./locales";

/**
 * Translation lookup with an explicit fallback chain.
 *
 * `en` is the only complete dictionary and the only source of truth for which
 * keys exist, so a partial translation degrades to English rather than to a raw
 * key or an empty label. Coverage is reported per locale by
 * `npm run i18n:coverage` (scripts/probes/i18n-coverage.mjs).
 */

export type MessageKey = keyof typeof en;
export type Dictionary = Partial<Record<MessageKey, string>>;
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export const DICTIONARIES: Record<Locale, Dictionary> = { en, am, es, fr };

/** `{name}` → value. Unknown placeholders are left intact, never printed as `undefined`. */
function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  const template = dictionary[key] ?? en[key] ?? String(key);
  return interpolate(template, vars);
}

export function createTranslator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}

/** Keys a locale still inherits from English — drives the coverage report. */
export function untranslatedKeys(locale: Locale): MessageKey[] {
  const dictionary = DICTIONARIES[locale] ?? {};
  return (Object.keys(en) as MessageKey[]).filter((key) => !dictionary[key]);
}

export function coveragePercent(locale: Locale): number {
  const total = Object.keys(en).length;
  if (total === 0) return 100;
  return Math.round(((total - untranslatedKeys(locale).length) / total) * 100);
}

export {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_MAX_AGE,
  LOCALE_STORAGE_KEY,
  resolveLocale,
  localeOption,
  isLocale,
} from "./locales";
export type { Locale, LocaleOption } from "./locales";
