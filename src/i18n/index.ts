import ru from "./ru.json";
import en from "./en.json";

export type Locale = "ru" | "en";
export const dictionaries = { ru, en } as const;

/**
 * Minimal placeholder i18n until a real library is wired up. UI strings must
 * live here, never hardcoded in components (see CLAUDE.md conventions).
 */
export const t = dictionaries.ru;
