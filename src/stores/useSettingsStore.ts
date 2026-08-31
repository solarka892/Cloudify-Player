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
import {
  accentFromArtwork,
  desaturate,
  paletteFromArtwork,
} from "@/theme/artwork";
import {
  applyAudio,
  DEFAULT_AUDIO,
  needsGraph,
  type AudioConfig,
} from "@/audio/engine";
import { PALETTES, type PaletteId } from "@/theme/palettes";
import type { SkinId } from "@/theme/skins";
import type { LayoutId } from "@/theme/layout";
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

/**
 * Re-exported, not declared: which arrangements exist is a question the theme
 * layer answers now, because a skin can decline one. See `theme/layout`.
 */
export type { LayoutId };

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
  /** Blurred, translucent surfaces. Costly to render; the toggle is the perf
   *  escape. See `buildVars`. */
  glass: boolean;
  /**
   * Reduce cover art to the skin's own treatment — Nit's two-ink duotone,
   * Obsidian's greyscale. Only those two ask for a filter, so this is inert
   * under the others — see `--art-filter`.
   */
  monoArtwork: boolean;
  /** Print screen headings twice, out of register. Inert unless the skin offsets. */
  printShift: boolean;
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
  // Ember on One: the app's one look. Everything else is on its way out — see
  // `theme/skins` for why five appearances were the thing making the app feel
  // unfinished, rather than any one of them being wrong.
  palette: "ember",
  skin: "one",
  accent: null,
  // On.
  //
  // It shipped off on the argument that a default has to be right for every
  // cover at once. That argument was wrong about this app: five rounds of
  // "still feels unfinished" against a restrained one-accent palette, and the
  // only change that drew a "better" was the one that put a record's own colour
  // on the screen. An interface for listening to music that does not take any
  // colour from the music is not restrained, it is empty.
  //
  // Still a setting, so a fixed accent is one switch away for anyone who wants
  // the interface to hold still (`theme/artwork`).
  accentFromArtwork: true,
  density: "cozy",
  uiScale: 100,
  // Off by default: `backdrop-filter` on every surface is the biggest
  // rendering cost on a software-composited desktop. Opt in, don't opt out.
  glass: false,
  // On by default so the Nit and Obsidian presets need no extra step to look
  // like themselves; inert under every other skin, which is why it costs
  // nothing to default to on.
  monoArtwork: true,
  printShift: true,
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

/** Where the HUD appears, as a screen corner. */
export type HudCorner = "tl" | "tr" | "bl" | "br";

/**
 * The Nit features: local, optional, and none of them appearance.
 *
 * A slice of its own rather than fields on `ThemeState`, for one reason that
 * matters — a theme file is something people trade, and `exportTheme` writes
 * `ThemeState` verbatim. A downloaded theme must not be able to switch on
 * clipboard reading, rebind a global hotkey or shorten how long your listening
 * history is kept.
 */
export interface NitState {
  /**
   * Watch the clipboard for SoundCloud links.
   *
   * Off, and it stays off until someone reads the sentence next to it and turns
   * it on. See `features/trap` for the rules this switch is only half of.
   */
  linkTrap: boolean;
  /** The always-on-top now-playing window. Desktop only. */
  hud: boolean;
  hudCorner: HudCorner;
  /** Reopen where the last session stopped, paused, with the queue intact. */
  resume: boolean;
  /** Days of listening history to keep. `0` means forever. */
  diaryDays: number;
  /** Global shortcuts, action id → accelerator. Empty string means unbound. */
  shortcuts: Record<string, string>;
}

/**
 * Accelerators as they ship.
 *
 * Modest on purpose: a global shortcut is taken from every other application on
 * the machine, so the defaults are combinations nothing else is likely to want,
 * and all of them are rebindable.
 */
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  mark: "CmdOrCtrl+Alt+M",
  hud: "CmdOrCtrl+Alt+H",
  playPause: "CmdOrCtrl+Alt+Space",
  next: "CmdOrCtrl+Alt+Right",
  prev: "CmdOrCtrl+Alt+Left",
};

const DEFAULT_NIT: NitState = {
  linkTrap: false,
  hud: false,
  hudCorner: "br",
  resume: true,
  // Six months: long enough that "what was I listening to in the spring" works,
  // short enough that the answer is not a life record nobody asked for.
  diaryDays: 180,
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

interface SettingsState {
  layout: LayoutId;
  theme: ThemeState;
  backdrop: BackdropState;
  presets: Preset[];
  /** Ids of easter-egg extras the user has found. */
  unlocked: string[];


  /** UI language. Applied to the live `t` dictionary, not just stored. */
  locale: Locale;
  autoplayNext: boolean;
  rememberVolume: boolean;
  volume: number;
  /** Cross-track fade in ms; 0 switches instantly. */
  fadeMs: number;
  /** Keep playing past the end of the queue with related tracks. */
  radio: boolean;
  /**
   * Play only what is on disk; never open a stream.
   *
   * Not the same thing as preferring the downloaded copy — that is unconditional
   * and needs no setting. This is for a metered connection or no connection at
   * all: a track with no local file refuses to play and says so, instead of
   * quietly spending data. Covers, lyrics and the next track's URL stop being
   * fetched with it.
   */
  offlineOnly: boolean;
  /** Equaliser and the rest of the signal chain. */
  audio: AudioConfig;
  /** The Nit features. */
  nit: NitState;

  /** Accent sampled from the current cover. Runtime only — never persisted. */
  artworkAccent: { brand: string; brand2: string } | null;
  /**
   * Every colour worth naming on the current cover, most prominent first.
   *
   * Beside the accent rather than derived from it: the accent is one colour
   * the interface is painted with, and this is the sleeve's own spread, which
   * only the full-screen player's glow wants. Runtime only, like the accent —
   * it belongs to whatever is playing, not to the user's settings.
   */
  artworkPalette: string[] | null;
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

  setLocale: (locale: Locale) => void;
  setAutoplayNext: (on: boolean) => void;
  setRememberVolume: (on: boolean) => void;
  rememberCurrentVolume: (volume: number) => void;
  setFadeMs: (ms: number) => void;
  setRadio: (on: boolean) => void;
  setOfflineOnly: (on: boolean) => void;
  setAudio: (patch: Partial<AudioConfig>) => void;
  resetAudio: () => void;
  setNit: (patch: Partial<NitState>) => void;
  /** Rebind one global shortcut. An empty accelerator unbinds it. */
  setShortcut: (id: string, accelerator: string) => void;
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
          monoArtwork: theme.monoArtwork,
          printShift: theme.printShift,
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

        locale: detectLocale(),
        autoplayNext: true,
        rememberVolume: true,
        volume: DEFAULT_VOLUME,
        fadeMs: 0,
        radio: false,
        offlineOnly: false,
        audio: { ...DEFAULT_AUDIO },
        nit: { ...DEFAULT_NIT, shortcuts: { ...DEFAULT_SHORTCUTS } },

        artworkAccent: null,
        artworkPalette: null,
        artworkUrl: null,

        setLayout: (layout) => set({ layout }),


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
            set({ artworkAccent: null, artworkPalette: null });
            sync();
            return;
          }
          // One decode, both answers — see `rankedHues`.
          const [accent, palette] = await Promise.all([
            accentFromArtwork(url),
            paletteFromArtwork(url),
          ]);
          // A greyscale or unreadable cover leaves the previous accent alone.
          if (!accent) return;
          if (get().artworkUrl !== url) return; // superseded while sampling
          set({ artworkAccent: accent, artworkPalette: palette });
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
          // Copied field by field, not referenced: handing a saved preset's
          // `theme` straight to `set` would let the next settings change edit
          // the preset itself.
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
        setOfflineOnly: (offlineOnly) => set({ offlineOnly }),

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

        setNit(patch) {
          set({ nit: { ...get().nit, ...patch } });
        },

        setShortcut(id, accelerator) {
          set({
            nit: {
              ...get().nit,
              shortcuts: { ...get().nit.shortcuts, [id]: accelerator },
            },
          });
        },
      };
    },
    {
      name: "cloudify.settings",
      version: 8,
      merge: (persisted, current) => fillDefaults(current, persisted),
      // Runtime-only artwork state must not be written to disk.
      partialize: (s) => ({
        layout: s.layout,
        theme: s.theme,
        backdrop: s.backdrop,
        presets: s.presets,
        unlocked: s.unlocked,
        locale: s.locale,
        autoplayNext: s.autoplayNext,
        rememberVolume: s.rememberVolume,
        volume: s.volume,
        fadeMs: s.fadeMs,
        radio: s.radio,
        offlineOnly: s.offlineOnly,
        audio: s.audio,
        nit: s.nit,
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
          if (from < 3) {
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

          // v5: Apple mode no longer has a transparency switch — the mode is
          // always glass (`buildVars`). Someone who had turned it *off* has a
          // saved `glass: false` underneath from before they entered the mode,
          // and leaving that is right: it is what they chose for every other
          // look, and it is no longer what Apple mode reads.
          delete theme.appleTransparency;

          // v6: `aurora` is gone. Anything still naming it resolves to nothing,
          // and `buildVars` would fall back silently — which is the right
          // behaviour for a stray id and the wrong one for a saved preset the
          // user can see in a list, where the swatch would then disagree with
          // what applying it does.
          if (from < 6 && theme.skin === "aurora") theme.skin = "nit";
        }

        retire(state?.theme);
        // v4: the same cleanup for saved presets, which v3 forgot — applying
        // one of those put an unresolvable id back into the live theme.
        for (const preset of state?.presets ?? []) retire(preset?.theme);

        // v6: the app has a look of its own, and every install moves onto it.
        //
        // This is a *choice*, and an unusual one — a migration that overwrites
        // settings someone deliberately changed is normally indefensible. It is
        // here because the previous default was not a design, it was an absence
        // of one, and shipping the app's identity to new installs only would
        // mean the people who have been using it longest are the only ones who
        // never see it.
        //
        // What it does not touch: their saved presets, their hand-written
        // overrides, their layout, their language, their audio chain and their
        // volume. So the way back is one tap on a preset they already have, and
        // nothing they authored is lost — only the three fields that say which
        // of the app's own looks is on.
        if (from < 6 && state?.theme) {
          state.theme.palette = "signal";
          state.theme.skin = "nit";
        }

        // v7: one look, and everyone lands on it.
        //
        // The same argument as v6 and it has to be made again, because the
        // thing v6 shipped turned out to be the problem rather than the fix:
        // the app had five appearances and the drift between them is what read
        // as unfinished. Ember on One replaces all of them, Apple mode
        // included.
        //
        // Overwriting a look someone chose is only defensible when the choice
        // is about to stop existing, which is exactly the case here. The same
        // three fields as last time, and nothing else: presets, overrides,
        // layout, language, audio and volume are all left alone, so a preset
        // they saved is still one tap away.
        if (from < 7 && state?.theme) {
          state.theme.palette = "ember";
          state.theme.skin = "one";
          state.theme.accentFromArtwork = true;
        }

        // v8: the column shell is gone and the player is a bar again.
        //
        // v7 landed every install on the column shell, but not on purpose: it
        // was settling the *look*, and it carried the shell along because one
        // flag happened to hold both. A look is a palette and a skin. Where the
        // player stands is neither, and nobody chose the column.
        //
        // The flag is deleted rather than set: there is no longer a field for
        // it to be, and a saved `apple: true` outliving the shell it named is
        // how a setting comes back from the dead. Everything else the user
        // chose — palette, skin, accent, layout, audio — is left alone.
        if (from < 8 && state?.theme) {
          delete state.theme.apple;
          for (const preset of state.presets ?? []) delete preset?.theme?.apple;
        }

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
    monoArtwork: s.theme.monoArtwork,
    printShift: s.theme.printShift,
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
