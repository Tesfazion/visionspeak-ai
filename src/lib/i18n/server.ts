import { cookies } from "next/headers";
import { createTranslator, type Translate } from "./index";
import { LOCALE_COOKIE, localeOption, resolveLocale, type Locale } from "./locales";

/**
 * Server-side locale resolution.
 *
 * The choice lives in a cookie (not localStorage) precisely so the *first*
 * paint is already in the right language: a server component can read it and
 * render translated HTML, with no flash of English and no client-only render.
 * `locales.ts` also mirrors the value into localStorage for the client provider.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

export interface ServerI18n {
  locale: Locale;
  t: Translate;
  dir: "ltr" | "rtl";
  htmlLang: string;
  nativeName: string;
}

export async function getI18n(): Promise<ServerI18n> {
  const locale = await getLocale();
  const option = localeOption(locale);
  return {
    locale,
    t: createTranslator(locale),
    dir: option.dir,
    htmlLang: option.htmlLang,
    nativeName: option.native,
  };
}
