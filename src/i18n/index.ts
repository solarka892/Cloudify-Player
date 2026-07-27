import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import it from "./it.json";
import pl from "./pl.json";
import pt from "./pt.json";
import ru from "./ru.json";
import tr from "./tr.json";
import uk from "./uk.json";

/**
 * UI strings. Never hardcode text in components (see CLAUDE.md conventions).
 *
 * `t` is a live export: `setLocale` reassigns it and every module that did
 * `import { t } from "@/i18n"` sees the new dictionary, because ES module
 * bindings are references rather than copies. Two rules follow from that:
 *
 *   - read `t.x.y` during render, never into a module-level constant — a table
 *     built at import time freezes the language it was imported with (use a
 *     getter if you need one, as `nav-items.ts` does);
 *   - remount the tree after switching so every rendered string is re-read.
 */

/** English is the reference shape; every other dictionary fills in over it. */
export type Dict = typeof en;

export type Locale =
  | "en"
  | "ru"
  | "uk"
  | "es"
  | "de"
  | "fr"
  | "it"
  | "pt"
  | "pl"
  | "tr";

/** Each language named in its own words, as language pickers should be. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  uk: "Українська",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
  pl: "Polski",
  tr: "Türkçe",
};

export const LOCALES = Object.keys(LOCALE_NAMES) as Locale[];

/**
 * Deep-fill a translation from English.
 *
 * A dictionary that is missing keys then shows English for them instead of
 * `undefined`, which is what makes adding a language a matter of dropping in a
 * JSON file rather than translating all 266 strings up front.
 */
function complete(partial: unknown): Dict {
  function fill(base: unknown, over: unknown): unknown {
    if (typeof base !== "object" || base === null) return over ?? base;
    if (typeof over !== "object" || over === null) return base;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base)) {
      out[key] = fill(value, (over as Record<string, unknown>)[key]);
    }
    return out;
  }
  return fill(en, partial) as Dict;
}

/**
 * Loaded eagerly: all ten dictionaries together are ~90 KB of JSON, far less
 * than the machinery to load one on demand, and switching stays instant.
 */
const raw: Record<Locale, unknown> = {
  en,
  ru,
  uk,
  es,
  de,
  fr,
  it,
  pt,
  pl,
  tr,
};

export const dictionaries = Object.fromEntries(
  LOCALES.map((locale) => [locale, complete(raw[locale])]),
) as Record<Locale, Dict>;

/** The active dictionary. Reassigned by `setLocale`. */
export let t: Dict = dictionaries.en;

export function setLocale(locale: Locale): void {
  t = dictionaries[locale] ?? dictionaries.en;
  document.documentElement.lang = locale;
}

/** What the OS suggests, for the very first run. Falls back to English. */
export function detectLocale(): Locale {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split("-")[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return "en";
}
