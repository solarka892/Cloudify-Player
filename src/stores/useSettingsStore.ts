import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * User settings, persisted in the webview's localStorage.
 *
 * Theme and accent are applied by writing to the document root rather than by
 * re-rendering: the tokens in `styles/globals.css` (`.dark`, `--brand`) are the
 * single source of truth for colour, so every component picks the change up.
 */

export type ThemeMode = "dark" | "light" | "system";

export type AccentId = "orange" | "pink" | "violet" | "blue" | "green" | "amber";

/** Accent presets. `brand2` is the second stop of the gradients. */
export const ACCENTS: Record<AccentId, { brand: string; brand2: string }> = {
  orange: { brand: "oklch(0.75 0.17 55)", brand2: "oklch(0.68 0.22 12)" },
  pink: { brand: "oklch(0.72 0.22 350)", brand2: "oklch(0.66 0.24 320)" },
  violet: { brand: "oklch(0.68 0.21 295)", brand2: "oklch(0.62 0.2 270)" },
  blue: { brand: "oklch(0.7 0.16 245)", brand2: "oklch(0.64 0.19 275)" },
  green: { brand: "oklch(0.74 0.17 155)", brand2: "oklch(0.72 0.15 185)" },
  amber: { brand: "oklch(0.83 0.16 85)", brand2: "oklch(0.76 0.17 60)" },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

/** Volume used when nothing has been remembered. */
export const DEFAULT_VOLUME = 0.8;

interface SettingsState {
  theme: ThemeMode;
  accent: AccentId;
  /** Play the next queued track when one finishes. */
  autoplayNext: boolean;
  /** Restore the last volume on start instead of resetting to the default. */
  rememberVolume: boolean;
  /** Last volume (0..1); only meaningful while `rememberVolume` is on. */
  volume: number;

  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentId) => void;
  setAutoplayNext: (on: boolean) => void;
  setRememberVolume: (on: boolean) => void;
  rememberCurrentVolume: (volume: number) => void;
}

const prefersDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyTheme(theme: ThemeMode) {
  const dark = theme === "dark" || (theme === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

function applyAccent(accent: AccentId) {
  const { brand, brand2 } = ACCENTS[accent];
  document.documentElement.style.setProperty("--brand", brand);
  document.documentElement.style.setProperty("--brand-2", brand2);
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "orange",
      autoplayNext: true,
      rememberVolume: true,
      volume: DEFAULT_VOLUME,

      setTheme(theme) {
        applyTheme(theme);
        set({ theme });
      },
      setAccent(accent) {
        applyAccent(accent);
        set({ accent });
      },
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setRememberVolume: (rememberVolume) => set({ rememberVolume }),
      rememberCurrentVolume: (volume) => set({ volume }),
    }),
    { name: "cloudify.settings" },
  ),
);

// Reflect the (possibly rehydrated) settings onto the document once at startup.
applyTheme(useSettingsStore.getState().theme);
applyAccent(useSettingsStore.getState().accent);

// Follow the OS only while the user asked us to.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (useSettingsStore.getState().theme === "system") applyTheme("system");
  });
