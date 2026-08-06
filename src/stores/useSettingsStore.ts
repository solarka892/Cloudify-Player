import { create } from "zustand";
import {
  detectLocale,
  setLocale as applyLocale,
  type Locale,
} from "@/i18n";
import { persist } from "zustand/middleware";
import {
  applyTheme,
  applyBackdrop,
  resolveDark,
  type Density,
  type ThemeMode,
} from "@/theme/apply";
import { accentFromArtwork, desaturate } from "@/theme/artwork";
import { setNativeDecorations } from "@/lib/window";
import {
  applyAudio,
  DEFAULT_AUDIO,
  needsGraph,
  type AudioConfig,
} from "@/audio/engine";
import { PALETTES, type PaletteId } from "@/theme/palettes";
import type { SkinId } from "@/theme/skins";
import type { EffectId } from "@/theme/particles";
import type { ThemeVars } from "@/theme/tokens";
import { fillDefaults } from "@/lib/merge";

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
  /** Falling particles over the whole app. Independent of `mode`. */
  effect: EffectId | "none";
  /** Particle count multiplier, 0.25–2. */
  effectIntensity: number;
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
  /**
   * Apple mode. Not a skin — it replaces the palette, the skin, the shell and
   * the player with an iOS interface. See `theme/apple.ts`.
   */
  apple: boolean;
  /** Apple mode's own glass switch; iOS calls the inverse Reduce Transparency. */
  appleTransparency: boolean;
  /**
   * Reduce cover art to one tone. Only the Obsidian skin asks for a filter, so
   * this is inert under the others — see `--art-filter`.
   */
  monoArtwork: boolean;
  /** Hand-edited CSS custom properties; win over everything else. */
  overrides: ThemeVars;
}

export interface Preset {
  id: string;
  name: string;
  theme: ThemeState;
  backdrop: BackdropState;
  layout: LayoutId;
  /**
   * Ships with the app rather than saved by the user. Cannot be deleted, and
   * applying it must not mutate it — see `applyPreset`.
   */
  builtin?: boolean;
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
  appleTransparency: true,
  // On by default so the Obsidian preset needs no extra step to look like
  // itself; inert under every other skin, which is why it costs nothing to
  // default to on.
  monoArtwork: true,
  overrides: {},
};

const DEFAULT_BACKDROP: BackdropState = {
  // The playing cover, blurred, is the app's default wallpaper — leaving this
  // at "none" meant the feature existed but nobody ever saw it.
  mode: "artwork",
  // Off by default: an animated full-window layer is exactly the kind of cost
  // this app is careful about, so it stays something the user asks for.
  effect: "none",
  effectIntensity: 1,
  image: null,
  blur: 40,
  dim: 0.55,
  saturate: 1.2,
};

/**
 * Presets that ship with the app.
 *
 * The three appearance axes are independent, and that is the point — but a
 * *designed* look is a particular combination of them, and asking the user to
 * find four settings before Obsidian looks like Obsidian would hide the design
 * behind the architecture. A preset is the one place the axes are allowed to be
 * named together, and it stays a suggestion: every switch it touches is still
 * there afterwards.
 *
 * Built-ins are not persisted. They live here so a later version can change what
 * "Obsidian" means without a migration, and so nothing the user saved can be
 * shadowed by an id we later reuse.
 */
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "builtin:obsidian",
    name: "Obsidian",
    builtin: true,
    layout: "rail",
    theme: {
      ...DEFAULT_THEME,
      mode: "dark",
      palette: "obsidian",
      skin: "obsidian",
      // The reference look. Glass stays a user-owned perf switch everywhere
      // else, but the preset is a statement about how the mode is meant to look,
      // and frosted is how: 30px of blur over a 26% surface.
      glass: true,
      accent: null,
      // Both off: the accent is white by palette, and a sampled one would be the
      // one colour in the interface. See `Palette.achromatic`.
      accentFromArtwork: false,
      apple: false,
      density: "cozy",
      monoArtwork: true,
      // A preset that carried overrides would silently discard the user's own
      // hand edits, which are theirs and not part of any look we ship.
      overrides: {},
    },
    backdrop: {
      ...DEFAULT_BACKDROP,
      mode: "artwork",
      blur: 64,
      // Deeper than the default 0.55: the wallpaper is the only thing the loupe
      // has to compete with, and at 0.55 a bright cover washes the light out.
      dim: 0.78,
      // Not optional. The blurred cover is a full-window field of colour, and it
      // is the single easiest way to put colour back into a mode that rules it
      // out — the skin also zeroes this in CSS, and both are on purpose.
      saturate: 0,
    },
  },
];

interface SettingsState {
  layout: LayoutId;
  theme: ThemeState;
  backdrop: BackdropState;
  presets: Preset[];
  /** Ids of easter-egg extras the user has found. */
  unlocked: string[];

  /**
   * Let the window manager draw the title bar instead of the app.
   *
   * The escape hatch for the custom chrome, not a style choice: without system
   * decorations the app owns dragging, the maximise button and every resize
   * edge, and a tiling WM or an unusual compositor can leave one of those not
   * working. Applied live with `setDecorations`, so a user who has locked
   * themselves out of resizing can get the real frame back without a restart —
   * which is also why it is *not* part of `ThemeState`: an imported theme file
   * must never be able to take a window's controls away.
   */
  nativeFrame: boolean;

  /** UI language. Applied to the live `t` dictionary, not just stored. */
  locale: Locale;
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
  setNativeFrame: (on: boolean) => void;
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

  setLocale: (locale: Locale) => void;
  setAutoplayNext: (on: boolean) => void;
  setRememberVolume: (on: boolean) => void;
  rememberCurrentVolume: (volume: number) => void;
  setFadeMs: (ms: number) => void;
  setRadio: (on: boolean) => void;
  setAudio: (patch: Partial<AudioConfig>) => void;
  resetAudio: () => void;
}

/**
 * Set by the player store at startup. Lets the settings store ask for a
 * source reload without importing it — that would be a cycle, since the
 * player already reads settings on every load.
 */
let reloadCurrentSource: () => Promise<void> = async () => {};

export function setSourceReloader(fn: () => Promise<void>): void {
  reloadCurrentSource = fn;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      /** Push the current appearance onto the document. */
      function sync(): void {
        const { theme, artworkAccent } = get();
        // An accent sampled from the cover is the one path by which colour can
        // reach a palette that rules colour out, and the palette gets to say what
        // happens to it. Reduced to its lightness rather than dropped: a dark
        // cover still gives a dark accent, so the setting keeps meaning something.
        const sampled =
          artworkAccent && PALETTES[theme.palette]?.achromatic
            ? desaturate(artworkAccent)
            : artworkAccent;
        applyTheme({
          mode: theme.mode,
          palette: theme.palette,
          skin: theme.skin,
          accent: theme.accent,
          density: theme.density,
          uiScale: theme.uiScale,
          glass: theme.glass,
          apple: theme.apple,
          appleTransparency: theme.appleTransparency,
          monoArtwork: theme.monoArtwork,
          // Artwork accent sits under the user's own edits, above the palette.
          overrides: {
            ...(theme.accentFromArtwork && sampled
              ? { "--brand": sampled.brand, "--brand-2": sampled.brand2 }
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
        // The app draws its own title bar by default; this is the way back to the
        // system's. See the field's comment for why that is the default.
        nativeFrame: false,

        locale: detectLocale(),
        autoplayNext: true,
        rememberVolume: true,
        volume: DEFAULT_VOLUME,
        fadeMs: 0,
        radio: false,
        audio: { ...DEFAULT_AUDIO },

        artworkAccent: null,
        artworkUrl: null,

        setLayout: (layout) => set({ layout }),

        setNativeFrame(on) {
          set({ nativeFrame: on });
          // Live, not on next launch: the whole reason this setting exists is
          // that someone may be unable to resize or move the window right now.
          void setNativeDecorations(on);
        },

        unlock(id) {
          if (get().unlocked.includes(id)) return false;
          set({ unlocked: [...get().unlocked, id] });
          return true;
        },

        setTheme(patch) {
          const before = get().theme;
          set({ theme: { ...before, ...patch } });
          sync();

          // Turning the artwork accent on has to sample the cover that is
          // *already* playing. `setArtwork` returns early while the setting is
          // off — deliberately, so a sampler doesn't run for nothing — which
          // means `artworkAccent` is still null at this point and `sync()` above
          // had nothing to apply. Without this the switch appears to do nothing
          // until the next track change.
          if (patch.accentFromArtwork && !before.accentFromArtwork) {
            void get().setArtwork(get().artworkUrl);
          }
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
          const preset =
            get().presets.find((p) => p.id === id) ??
            BUILTIN_PRESETS.find((p) => p.id === id);
          if (!preset) return;
          // Copied field by field, not referenced. A built-in is a module-level
          // object shared by every window and every later `applyPreset`, so
          // handing its `theme` straight to `set` would let the next settings
          // change edit the preset itself.
          set({
            theme: { ...preset.theme, overrides: { ...preset.theme.overrides } },
            backdrop: { ...preset.backdrop },
            layout: preset.layout,
          });
          sync();
        },

        deletePreset(id) {
          // Built-ins are not in `presets`, so this cannot reach them — the guard
          // is in the UI, which does not offer the button.
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

        setLocale: (locale) => {
          applyLocale(locale);
          set({ locale });
        },
        setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
        setRememberVolume: (rememberVolume) => set({ rememberVolume }),
        rememberCurrentVolume: (volume) => set({ volume }),
        setFadeMs: (fadeMs) => set({ fadeMs }),
        setRadio: (radio) => set({ radio }),

        setAudio(patch) {
          const before = get().audio;
          const audio = { ...before, ...patch };
          set({ audio });
          applyAudio(audio);

          // The CORS mode is fixed at load time, so turning the graph on or
          // off only takes effect on the next source — reload in place.
          if (needsGraph(before) !== needsGraph(audio)) {
            void reloadCurrentSource();
          }
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
      version: 4,
      merge: (persisted, current) => fillDefaults(current, persisted),
      // Runtime-only artwork state must not be written to disk.
      partialize: (s) => ({
        layout: s.layout,
        theme: s.theme,
        backdrop: s.backdrop,
        presets: s.presets,
        unlocked: s.unlocked,
        nativeFrame: s.nativeFrame,
        locale: s.locale,
        autoplayNext: s.autoplayNext,
        rememberVolume: s.rememberVolume,
        volume: s.volume,
        fadeMs: s.fadeMs,
        radio: s.radio,
        audio: s.audio,
      }),
      migrate: (persisted, from) => {
        // v1 stored a flat {theme, accent, ...}; too far from the three-axis
        // model to salvage, so those users start clean.
        if (from < 2) return {} as never;

        // v3 removed the *first* Apple mode, which was a skin and a palette.
        // Both ids are retired here and both retirements still stand, for
        // different reasons: `skin: "apple"` resolves to nothing at all, while
        // `palette: "apple"` resolves again — but to the current mode's iOS
        // palette, which is not the colours that id used to mean. Landing on a
        // default is the honest outcome either way.
        //
        // The `apple` flag this deletes is that old one, whose value said
        // nothing about the mode that replaced it — the current one is a
        // different feature that happens to reuse the name. It is added back
        // by `fillDefaults`, off, which is the right place to start.
        const state = persisted as {
          theme?: Record<string, unknown>;
          presets?: { theme?: Record<string, unknown> }[];
        } | null;

        function retire(theme: Record<string, unknown> | undefined): void {
          if (!theme) return;
          if (theme.skin === "apple") theme.skin = "aurora";
          if (theme.palette === "apple") theme.palette = "midnight";
          for (const dead of [
            "apple",
            "appleVibrancy",
            "appleRoundness",
            "appleReduceTransparency",
          ]) {
            delete theme[dead];
          }
        }

        retire(state?.theme);
        // v4: the same cleanup for saved presets, which v3 forgot — applying
        // one of those put an unresolvable id back into the live theme.
        for (const preset of state?.presets ?? []) retire(preset?.theme);

        return state as never;
      },
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
    apple: s.theme.apple,
    appleTransparency: s.theme.appleTransparency,
    monoArtwork: s.theme.monoArtwork,
    overrides: s.theme.overrides,
  });
  // `tauri.conf.json` launches the window undecorated, which is the common case
  // and avoids a visible re-frame at startup. Only the minority who asked for the
  // system frame need it put back, so only they pay for the flip.
  if (s.nativeFrame) void setNativeDecorations(true);
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
