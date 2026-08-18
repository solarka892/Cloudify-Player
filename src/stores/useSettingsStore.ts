import { create } from "zustand";
import {
  detectLocale,
  setLocale as applyLocale,
  type Locale,
} from "@/i18n";
import { persist } from "zustand/middleware";
import { applyTheme, resolveDark, type ThemeMode } from "@/theme/apply";
import { accentFromArtwork } from "@/theme/artwork";
import {
  applyAudio,
  DEFAULT_AUDIO,
  needsGraph,
  type AudioConfig,
} from "@/audio/engine";
import { accentValue, type AccentId } from "@/theme/palettes";
import type { ThemeVars } from "@/theme/tokens";
import { fillDefaults } from "@/lib/merge";

/**
 * Everything the user can change about the app, persisted to the webview's
 * localStorage.
 *
 * ## What appearance used to be here
 *
 * Three independent axes — layout, skin, palette — plus a backdrop, plus saved
 * presets to name combinations of them. Seventeen palettes, five skins, three
 * layouts: 255 valid appearances, and the drift between them is what read as
 * unfinished. Relief is one appearance, so what is left below is the part that
 * was always a real preference rather than an unanswered design question: which
 * printing (light or dark), which band of the ramp accents it, whether the
 * playing cover picks that band, and how large the sheet is drawn.
 *
 * Everything non-appearance — language, audio chain, volume, the Nit features —
 * is untouched by any of that.
 */

export interface ThemeState {
  /** Which printing: the light stock, the black one, or whatever the OS says. */
  mode: ThemeMode;
  /** A band of the relief ramp, or `null` for the water. */
  accent: AccentId | null;
  /**
   * Let the playing cover choose the band.
   *
   * Asked for by name, and legal under a language that forbids colours the
   * legend cannot name because the sampled colour is snapped to the ramp rather
   * than applied as found. See `theme/artwork`.
   */
  accentFromArtwork: boolean;
  /** 80–140. Scale, not density: the sheet gets bigger, not looser. */
  uiScale: number;
  /** Hand-edited custom properties; win over everything else. */
  overrides: ThemeVars;
}

/** Shape written to disk and produced by "export theme". */
export interface ThemeFile {
  cloudifyTheme: 1;
  name: string;
  theme: ThemeState;
}

export const DEFAULT_VOLUME = 0.8;


const DEFAULT_THEME: ThemeState = {
  // The black stock, because that is what a player is opened into at night and
  // the light one is a deliberate act. Both are the same sheet; see `palettes`.
  mode: "dark",
  // The water. A band is a choice; the water is the sheet's own colour.
  accent: null,
  // On. Five rounds of "still feels unfinished" against a restrained accent, and
  // the only change that ever drew a "better" was the one that put a record's own
  // colour on the screen. Under Relief it can no longer misbehave: whatever it
  // samples lands on a band the legend already names.
  accentFromArtwork: true,
  uiScale: 100,
  overrides: {},
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
  theme: ThemeState;
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
  /** The band the playing cover was snapped to. Runtime only. */
  artworkAccent: AccentId | null;
  /** URL of the cover the accent was sampled from. Runtime only. */
  artworkUrl: string | null;

  /** Reveal a hidden extra. Returns true the first time only. */
  unlock: (id: string) => boolean;
  setTheme: (patch: Partial<ThemeState>) => void;
  setOverride: (name: string, value: string | null) => void;
  resetTheme: () => void;

  /** Tell the theme engine which cover is playing. */
  setArtwork: (url: string | null) => Promise<void>;

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
        applyTheme({
          mode: theme.mode,
          accent: theme.accent,
          uiScale: theme.uiScale,
          // The cover's band beats the chosen one while something is playing,
          // and the user's own overrides beat both — see `buildVars`.
          artworkAccent:
            theme.accentFromArtwork && artworkAccent
              ? accentValue(artworkAccent, resolveDark(theme.mode))
              : null,
          overrides: theme.overrides,
        });
      }

      return {
        theme: DEFAULT_THEME,
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
        artworkUrl: null,

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
          set({ theme: { ...DEFAULT_THEME } });
          sync();
        },

        async setArtwork(url) {
          set({ artworkUrl: url });

          if (!get().theme.accentFromArtwork) return;
          if (!url) {
            set({ artworkAccent: null });
            sync();
            return;
          }
          const band = await accentFromArtwork(url);
          // A greyscale or unreadable cover leaves the previous band alone.
          if (!band) return;
          if (get().artworkUrl !== url) return; // superseded while sampling
          set({ artworkAccent: band });
          sync();
        },

        exportTheme(name = "My theme") {
          const file: ThemeFile = { cloudifyTheme: 1, name, theme: get().theme };
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
            // (missing fields added since) still loads. A file from before Relief
            // carries palettes and skins that no longer exist; those keys simply
            // are not in `ThemeState` any more, so they land nowhere.
            theme: { ...DEFAULT_THEME, ...file.theme },
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
      merge: (persisted, current) => fillDefaults(current, persisted),
      // Runtime-only artwork state must not be written to disk.
      partialize: (s) => ({
        theme: s.theme,
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
      version: 8,
      migrate: (persisted, from) => {
        // Everything before v8 described a different appearance system: three
        // axes, seventeen palettes, five skins, three layouts, saved presets and
        // a backdrop. None of those fields exist now, and none of them can be
        // translated — there is no palette that means "Obsidian" any more, so a
        // migration cannot honour one.
        //
        // So the appearance is reset and everything else is kept. That is the
        // whole of it: `theme` goes back to the default, and `locale`, `volume`,
        // `audio`, `nit` and the shortcuts are carried across untouched. Losing a
        // hand-picked palette is a real loss and is stated plainly rather than
        // faked; keeping someone's equaliser curve and their global hotkeys
        // matters more than pretending their old skin survived.
        //
        // Hand-written `theme.overrides` are the one appearance field kept: they
        // are the user's own CSS, they were always applied last, and a property
        // Relief no longer defines simply does nothing.
        if (from < 8) {
          const old = persisted as { theme?: { overrides?: unknown } } | null;
          const overrides =
            old?.theme?.overrides && typeof old.theme.overrides === "object"
              ? (old.theme.overrides as Record<string, string>)
              : {};
          return {
            ...(persisted as object),
            theme: { ...DEFAULT_THEME, overrides },
            // Both belonged to the old system and have nowhere to land.
            layout: undefined,
            backdrop: undefined,
            presets: undefined,
          } as never;
        }
        return persisted as never;
      },
    },
  ),
);

// Reflect the rehydrated settings onto the document once at startup.
{
  const s = useSettingsStore.getState();
  applyTheme({
    mode: s.theme.mode,
    accent: s.theme.accent,
    uiScale: s.theme.uiScale,
    // Nothing is playing yet, so there is no cover to sample from.
    artworkAccent: null,
    overrides: s.theme.overrides,
  });
}

// Follow the OS only while the user asked us to.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const s = useSettingsStore.getState();
  if (s.theme.mode !== "system") return;
  document.documentElement.classList.toggle("dark", resolveDark("system"));
  s.setTheme({}); // recompose with the new resolved mode
});
