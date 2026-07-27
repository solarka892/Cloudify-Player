import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyTheme,
  applyBackdrop,
  resolveDark,
  type Density,
  type ThemeMode,
} from "@/theme/apply";
import { accentFromArtwork } from "@/theme/artwork";
import { applyAudio, DEFAULT_AUDIO, type AudioConfig } from "@/audio/engine";
import type { PaletteId } from "@/theme/palettes";
import type { SkinId } from "@/theme/skins";
import type { ThemeVars } from "@/theme/tokens";

/**
 * Everything the user can change about the app, persisted to the webview's
 * localStorage.
 *
 * Appearance is deliberately split into three independent axes — layout
 * (structure), skin (form) and palette (colour) — so any combination is valid
 * and a saved preset is just a snapshot of all three plus the backdrop.
 */

export type LayoutId = "rail" | "top" | "sidebar";

export interface BackdropState {
  /** `artwork` tracks the playing cover; `image` is a user file. */
  mode: "none" | "artwork" | "image";
  /** Data URL of the user's background image. */
  image: string | null;
  /** Blur radius in px. */
  blur: number;
  /** Darkening overlay, 0..1. */
  dim: number;
  /** Saturation multiplier, 0..2. */
  saturate: number;
}

export interface ThemeState {
  mode: ThemeMode;
  palette: PaletteId;
  skin: SkinId;
  /** Accent preset id, or `null` for the palette's own accent. */
  accent: string | null;
  /** Derive the accent from the playing track's cover instead. */
  accentFromArtwork: boolean;
  density: Density;
  uiScale: number;
  /** Liquid-glass surfaces. Costly to render; the toggle is the perf escape. */
  glass: boolean;
  /** Apple mode: the apple skin plus its own vibrancy/roundness knobs. */
  apple: boolean;
  /** Vibrancy as a percentage of opacity, 30–100. Lower is more see-through. */
  appleVibrancy: number;
  /** Corner roundness in px, 6–26. */
  appleRoundness: number;
  /** Accessibility-style escape hatch: drop transparency, keep the shape. */
  appleReduceTransparency: boolean;
  /** Hand-edited CSS custom properties; win over everything else. */
  overrides: ThemeVars;
}

export interface Preset {
  id: string;
  name: string;
  theme: ThemeState;
  backdrop: BackdropState;
  layout: LayoutId;
}

/** Shape written to disk and produced by "export theme". */
export interface ThemeFile {
  cloudifyTheme: 1;
  name: string;
  theme: ThemeState;
  backdrop: BackdropState;
  layout: LayoutId;
}

export const DEFAULT_VOLUME = 0.8;

/** Reject background images bigger than this — localStorage is not a filesystem. */
const MAX_BACKGROUND_BYTES = 4_000_000;

const DEFAULT_THEME: ThemeState = {
  mode: "dark",
  palette: "midnight",
  skin: "aurora",
  accent: null,
  accentFromArtwork: false,
  density: "cozy",
  uiScale: 100,
  // Off by default: `backdrop-filter` on every surface is the biggest
  // rendering cost on a software-composited desktop. Opt in, don't opt out.
  glass: false,
  apple: false,
  appleVibrancy: 62,
  appleRoundness: 18,
  appleReduceTransparency: false,
  overrides: {},
};

/** Fold the Apple knobs into plain token overrides. */
function appleOverrides(theme: ThemeState): ThemeState {
  const overrides = { ...theme.overrides };
  if (theme.apple) {
    overrides["--surface-alpha"] = theme.appleReduceTransparency
      ? "100%"
      : `${theme.appleVibrancy}%`;
    overrides["--radius"] = `${theme.appleRoundness}px`;
    overrides["--radius-control"] = `${Math.round(theme.appleRoundness * 0.62)}px`;
    overrides["--radius-hero"] = `${Math.round(theme.appleRoundness * 1.4)}px`;
  } else {
    delete overrides["--surface-alpha"];
    delete overrides["--radius"];
    delete overrides["--radius-control"];
    delete overrides["--radius-hero"];
  }
  return { ...theme, overrides };
}

const DEFAULT_BACKDROP: BackdropState = {
  mode: "none",
  image: null,
  blur: 40,
  dim: 0.55,
  saturate: 1.2,
};

interface SettingsState {
  layout: LayoutId;
  theme: ThemeState;
  backdrop: BackdropState;
  presets: Preset[];
  /** Ids of easter-egg extras the user has found. */
  unlocked: string[];

  autoplayNext: boolean;
  rememberVolume: boolean;
  volume: number;
  /** Cross-track fade in ms; 0 switches instantly. */
  fadeMs: number;
  /** Keep playing past the end of the queue with related tracks. */
  radio: boolean;
  /** Equaliser and the rest of the signal chain. */
  audio: AudioConfig;

  /** Accent sampled from the current cover. Runtime only — never persisted. */
  artworkAccent: { brand: string; brand2: string } | null;
  /** URL of the cover currently driving the backdrop. Runtime only. */
  artworkUrl: string | null;

  setLayout: (layout: LayoutId) => void;
  /** Reveal a hidden extra. Returns true the first time only. */
  unlock: (id: string) => boolean;
  setTheme: (patch: Partial<ThemeState>) => void;
  setOverride: (name: string, value: string | null) => void;
  resetTheme: () => void;
  setBackdrop: (patch: Partial<BackdropState>) => void;
  /** Returns an error message, or `null` on success. */
  setBackdropImage: (dataUrl: string) => string | null;

  /** Tell the theme engine which cover is playing. */
  setArtwork: (url: string | null) => Promise<void>;

  savePreset: (name: string) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  exportTheme: (name?: string) => string;
  /** Returns an error message, or `null` on success. */
  importTheme: (json: string) => string | null;

  setAutoplayNext: (on: boolean) => void;
  setRememberVolume: (on: boolean) => void;
  rememberCurrentVolume: (volume: number) => void;
  setFadeMs: (ms: number) => void;
  setRadio: (on: boolean) => void;
  setAudio: (patch: Partial<AudioConfig>) => void;
  resetAudio: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      /** Push the current appearance onto the document. */
      function sync(): void {
        const { theme, artworkAccent } = get();
        applyTheme({
          mode: theme.mode,
          palette: theme.palette,
          skin: theme.skin,
          accent: theme.accent,
          density: theme.density,
          uiScale: theme.uiScale,
          glass: theme.glass,
          // Artwork accent sits under the user's own edits, above the palette.
          overrides: {
            ...(theme.accentFromArtwork && artworkAccent
              ? { "--brand": artworkAccent.brand, "--brand-2": artworkAccent.brand2 }
              : {}),
            ...theme.overrides,
          },
        });
        syncBackdrop();
      }

      function syncBackdrop(): void {
        const { backdrop, artworkUrl } = get();
        const source =
          backdrop.mode === "image"
            ? backdrop.image
            : backdrop.mode === "artwork"
              ? artworkUrl
              : null;
        applyBackdrop({
          "--backdrop-image": source ? `url("${source}")` : "none",
          "--backdrop-blur": `${backdrop.blur}px`,
          "--backdrop-dim": String(backdrop.dim),
          "--backdrop-saturate": String(backdrop.saturate),
        });
      }

      return {
        layout: "rail",
        theme: DEFAULT_THEME,
        backdrop: DEFAULT_BACKDROP,
        presets: [],
        unlocked: [],

        autoplayNext: true,
        rememberVolume: true,
        volume: DEFAULT_VOLUME,
        fadeMs: 0,
        radio: false,
        audio: { ...DEFAULT_AUDIO },

        artworkAccent: null,
        artworkUrl: null,

        setLayout: (layout) => set({ layout }),

        unlock(id) {
          if (get().unlocked.includes(id)) return false;
          set({ unlocked: [...get().unlocked, id] });
          return true;
        },

        setTheme(patch) {
          const next = { ...get().theme, ...patch };

          // Entering Apple mode carries its own defaults; leaving it restores
          // the previous skin rather than stranding the user on `apple`.
          if (patch.apple === true) {
            next.skin = "apple";
            next.glass = !next.appleReduceTransparency;
          } else if (patch.apple === false && next.skin === "apple") {
            next.skin = "aurora";
          }

          set({ theme: appleOverrides(next) });
          sync();
        },

        setOverride(name, value) {
          const overrides = { ...get().theme.overrides };
          if (value === null) delete overrides[name];
          else overrides[name] = value;
          set({ theme: { ...get().theme, overrides } });
          sync();
        },

        resetTheme() {
          set({ theme: { ...DEFAULT_THEME }, backdrop: { ...DEFAULT_BACKDROP } });
          sync();
        },

        setBackdrop(patch) {
          set({ backdrop: { ...get().backdrop, ...patch } });
          syncBackdrop();
        },

        setBackdropImage(dataUrl) {
          if (dataUrl.length > MAX_BACKGROUND_BYTES) {
            return "too-large";
          }
          set({
            backdrop: { ...get().backdrop, image: dataUrl, mode: "image" },
          });
          syncBackdrop();
          return null;
        },

        async setArtwork(url) {
          set({ artworkUrl: url });
          syncBackdrop();

          if (!get().theme.accentFromArtwork) return;
          if (!url) {
            set({ artworkAccent: null });
            sync();
            return;
          }
          const accent = await accentFromArtwork(url);
          // A greyscale or unreadable cover leaves the previous accent alone.
          if (!accent) return;
          if (get().artworkUrl !== url) return; // superseded while sampling
          set({ artworkAccent: accent });
          sync();
        },

        savePreset(name) {
          const { theme, backdrop, layout, presets } = get();
          const preset: Preset = {
            id: `${Date.now().toString(36)}`,
            name,
            theme: { ...theme },
            backdrop: { ...backdrop },
            layout,
          };
          set({ presets: [...presets, preset] });
        },

        applyPreset(id) {
          const preset = get().presets.find((p) => p.id === id);
          if (!preset) return;
          set({
            theme: { ...preset.theme },
            backdrop: { ...preset.backdrop },
            layout: preset.layout,
          });
          sync();
        },

        deletePreset(id) {
          set({ presets: get().presets.filter((p) => p.id !== id) });
        },

        exportTheme(name = "My theme") {
          const { theme, backdrop, layout } = get();
          const file: ThemeFile = { cloudifyTheme: 1, name, theme, backdrop, layout };
          return JSON.stringify(file, null, 2);
        },

        importTheme(json) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(json);
          } catch {
            return "invalid-json";
          }
          const file = parsed as Partial<ThemeFile>;
          if (file?.cloudifyTheme !== 1 || !file.theme) return "not-a-theme";

          set({
            // Merge onto the defaults so a theme written by an older version
            // (missing fields added since) still loads.
            theme: { ...DEFAULT_THEME, ...file.theme },
            backdrop: { ...DEFAULT_BACKDROP, ...(file.backdrop ?? {}) },
            layout: file.layout ?? get().layout,
          });
          sync();
          return null;
        },

        setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
        setRememberVolume: (rememberVolume) => set({ rememberVolume }),
        rememberCurrentVolume: (volume) => set({ volume }),
        setFadeMs: (fadeMs) => set({ fadeMs }),
        setRadio: (radio) => set({ radio }),

        setAudio(patch) {
          const audio = { ...get().audio, ...patch };
          set({ audio });
          applyAudio(audio);
        },

        resetAudio() {
          const audio = { ...DEFAULT_AUDIO };
          set({ audio });
          applyAudio(audio);
        },
      };
    },
    {
      name: "cloudify.settings",
      version: 2,
      // Runtime-only artwork state must not be written to disk.
      partialize: (s) => ({
        layout: s.layout,
        theme: s.theme,
        backdrop: s.backdrop,
        presets: s.presets,
        unlocked: s.unlocked,
        autoplayNext: s.autoplayNext,
        rememberVolume: s.rememberVolume,
        volume: s.volume,
        fadeMs: s.fadeMs,
        radio: s.radio,
        audio: s.audio,
      }),
      // v1 stored a flat {theme, accent, ...}; start those users clean rather
      // than half-migrating into the three-axis model.
      migrate: () => ({}) as never,
    },
  ),
);

// Reflect the rehydrated settings onto the document once at startup.
{
  const s = useSettingsStore.getState();
  applyTheme({
    mode: s.theme.mode,
    palette: s.theme.palette,
    skin: s.theme.skin,
    accent: s.theme.accent,
    density: s.theme.density,
    uiScale: s.theme.uiScale,
    glass: s.theme.glass,
    overrides: s.theme.overrides,
  });
  applyBackdrop({
    "--backdrop-image": s.backdrop.image && s.backdrop.mode === "image"
      ? `url("${s.backdrop.image}")`
      : "none",
    "--backdrop-blur": `${s.backdrop.blur}px`,
    "--backdrop-dim": String(s.backdrop.dim),
    "--backdrop-saturate": String(s.backdrop.saturate),
  });
}

// Follow the OS only while the user asked us to.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const s = useSettingsStore.getState();
  if (s.theme.mode !== "system") return;
  document.documentElement.classList.toggle("dark", resolveDark("system"));
  s.setTheme({}); // recompose with the new resolved mode
});
