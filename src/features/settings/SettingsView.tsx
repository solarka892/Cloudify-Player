import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Monitor,
  Moon,
  RotateCcw,
  Palette as PaletteIcon,
  SlidersHorizontal,
  Sun,
  HardDrive,
  Trash2,
  Upload,
  Volume2,
  Wallpaper,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AudioSettings } from "./AudioSettings";
import { StorageSettings } from "./StorageSettings";

import {
  PALETTES,
  PALETTE_IDS,
  HIDDEN_PALETTE_IDS,
  ACCENTS,
  ACCENT_IDS,
} from "@/theme/palettes";

import { DEFAULT_BACKDROP, useSettingsStore } from "@/stores/useSettingsStore";
import { EFFECT_IDS } from "@/theme/particles";
import type { Density, ThemeMode } from "@/theme/apply";
import {
  LOCALES,
  LOCALE_NAMES,
  t,
  type Locale,
} from "@/i18n";
/**
 * An icon component, as every glyph in this screen is drawn.
 *
 * Declared here rather than imported: it used to come from the SF set that the
 * Apple shell supplied, and that set went with the shell.
 */
type Glyph = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;
import { scrollViewToTop } from "@/lib/scroll";
import { cn } from "@/lib/utils";
import { ViewHead } from "@/components/ViewHead";


/**
 * Everything the user can bend.
 *
 * Appearance is presented along the same three axes the theme engine uses —
 * layout, skin, palette — because they compose freely and pretending otherwise
 * would just hide combinations from the user.
 */
export function SettingsView() {
  const theme = useSettingsStore((s) => s.theme);
  const backdrop = useSettingsStore((s) => s.backdrop);
  const unlocked = useSettingsStore((s) => s.unlocked);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const offlineOnly = useSettingsStore((s) => s.offlineOnly);
  const setOfflineOnly = useSettingsStore((s) => s.setOfflineOnly);
  const rememberVolume = useSettingsStore((s) => s.rememberVolume);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setBackdrop = useSettingsStore((s) => s.setBackdrop);
  const setBackdropImage = useSettingsStore((s) => s.setBackdropImage);
  const setOverride = useSettingsStore((s) => s.setOverride);
  const setAutoplayNext = useSettingsStore((s) => s.setAutoplayNext);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setRememberVolume = useSettingsStore((s) => s.setRememberVolume);

  const glyphs = useGlyphs();

  const [section, setSection] = useState<SectionId>("appearance");
  const [notice, setNotice] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // The section list is sticky, so a section can be picked from far down a long
  // one. The next section starts at its own top rather than at that offset.
  useEffect(() => {
    scrollViewToTop();
  }, [section]);

  function pickImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const error = setBackdropImage(String(reader.result));
      setNotice(error === "too-large" ? t.settings.imageTooLarge : null);
    };
    reader.readAsDataURL(file);
  }



  return (
    <div className="flex w-full gap-6">
      {/* Section list — settings are browsed, not scrolled through. */}
      <nav className="settings-nav hidden w-48 shrink-0 flex-col gap-0.5 self-start md:flex">
        {/* A label, not the screen's heading.
            The heading belongs in the content column with every other screen's
            — a 30px uppercase title with a second impression behind it does not
            fit a 12rem sidebar, and a page with two `h1`s of different sizes has
            no hierarchy at all. */}
        <div className="label mb-2 px-2 text-muted-foreground">
          {t.nav.settings}
        </div>
        {SECTIONS.map(({ id, label }) => {
          const Icon = glyphs.sections[id];
          return (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)]",
                section === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="stack-lg min-w-0 max-w-2xl flex-1">
        <ViewHead
          title={t.nav.settings}
          sub={SECTIONS.find((entry) => entry.id === section)?.label}
        />
        {/* Narrow windows get the same list as a scroller. */}
        <nav className="flex gap-1 overflow-x-auto md:hidden">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                "shrink-0 rounded-[var(--radius-control)] px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
                section === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="label">{label}</span>
            </button>
          ))}
        </nav>

      {notice && (
        <p className="panel px-4 py-2 text-sm text-muted-foreground">{notice}</p>
      )}

      <div key={section} className="stack-lg view-enter">
      {section === "appearance" && (<>
      {/* ── Ready-made looks ───────────────────────────────────────────── */}
      {/* First, and the only place in Settings where the three axes appear under
          one name. They compose freely and the sections below keep saying so —
          but a designed look *is* a particular combination, and asking someone to
          find four switches before Obsidian looks like Obsidian would hide the
          design behind the architecture. Applying one leaves every switch it
          touched still switchable. */}
      {/*
        Four sections used to stand here: the built-in looks, the layout
        picker, the skin picker and saved presets.

        They are gone with the thing they configured. The app had five
        appearances and three arrangements, and the drift between them is what
        made it feel unfinished — so it has one of each now, and a setting that
        offers a choice the app can no longer make is worse than no setting: it
        is a promise the screen cannot keep. The user opened this page and saw
        "Nit / Obsidian / Apple" still listed, which is exactly how a redesign
        gets read as "nothing changed".

        Colour stayed, below. That is a real choice and always was.
      */}

      {/* ── Language ───────────────────────────────────────────────────── */}
      <Group title={t.settings.language} hint={t.settings.languageHint}>
        <Row label={t.settings.language}>
          {/* `appearance-none` is the whole point: left native, the control
              paints the platform's own widget — a light box on a light GTK
              theme — under our light `foreground` text, and the current
              language becomes unreadable. Stripping the native look means our
              colours apply, at the price of drawing the arrow ourselves. */}
          <div className="relative">
            <select
              value={locale}
              onChange={(e) => setLocale(e.currentTarget.value as Locale)}
              className="appearance-none rounded-[var(--radius-control)] border border-border bg-card py-1.5 pl-3 pr-9 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              {LOCALES.map((id) => (
                <option
                  key={id}
                  value={id}
                  // The dropdown list is drawn by the platform, which does not
                  // inherit any of the above; these two are all it honours.
                  className="bg-popover text-popover-foreground"
                >
                  {LOCALE_NAMES[id]}
                </option>
              ))}
            </select>
            <glyphs.chevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </Row>
      </Group>

      {/* ── Colour ─────────────────────────────────────────────────────── */}
      <Group
        title={t.settings.colour}
        onReset={() =>
          setTheme({
            mode: "dark",
            palette: "midnight",
            accent: null,
            accentFromArtwork: false,
            overrides: {},
          })
        }
      >
        <Row label={t.settings.theme}>
          <Segmented
            value={theme.mode}
            onChange={(mode) => setTheme({ mode: mode as ThemeMode })}
            options={[
              { id: "dark", get label() {
    return t.settings.themeDark;
  }, Icon: glyphs.dark },
              { id: "light", get label() {
    return t.settings.themeLight;
  }, Icon: glyphs.light },
              { id: "system", get label() {
    return t.settings.themeSystem;
  }, Icon: glyphs.system },
            ]}
          />
        </Row>

        <Row label={t.settings.palette}>
          <div className="flex flex-wrap gap-2">
            {[
              ...PALETTE_IDS,
              // Easter-egg palettes appear only once they've been found.
              ...HIDDEN_PALETTE_IDS.filter((id) =>
                unlocked.includes(`palette:${id}`),
              ),
            ].map((id) => {
              const shade = PALETTES[id].dark;
              return (
                <button
                  key={id}
                  onClick={() => setTheme({ palette: id })}
                  title={PALETTES[id].name}
                  aria-label={PALETTES[id].name}
                  className={cn(
                    "h-8 w-8 overflow-hidden rounded-[var(--radius-round)] border-2 transition-transform duration-[var(--motion-fast)] hover:scale-110",
                    theme.palette === id ? "border-foreground" : "border-transparent",
                  )}
                  // The accent is a *dot*, not a wedge.
                  //
                  // Any wedge of accent reads as "this theme is that colour",
                  // which for the Apple palette meant a near-black theme
                  // advertising itself as blue — and shrinking the wedge did not
                  // help, because next to black the mid-grey wedge beside it is
                  // invisible, so the swatch still looked half blue. A page-to-
                  // card gradient with the accent as a spot says what the
                  // interface is: a dark theme, tinted.
                  style={{
                    backgroundImage: [
                      `radial-gradient(circle at 72% 72%, ${shade.brand} 0 30%, transparent 31%)`,
                      `linear-gradient(140deg, ${shade.bg} 0%, ${shade.surface2} 100%)`,
                    ].join(", "),
                  }}
                />
              );
            })}
          </div>
        </Row>

        <Row label={t.settings.accent} hint={t.settings.accentHint}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTheme({ accent: null, accentFromArtwork: false })}
              className={cn(
                "rounded-[var(--radius-control)] border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)]",
                !theme.accent && !theme.accentFromArtwork
                  ? "border-brand bg-accent"
                  : "border-border hover:bg-accent/60",
              )}
            >
              {t.settings.accentAuto}
            </button>
            {ACCENT_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setTheme({ accent: id, accentFromArtwork: false })}
                aria-label={id}
                className={cn(
                  "h-7 w-7 rounded-[var(--radius-round)] border-2 transition-transform duration-[var(--motion-fast)] hover:scale-110",
                  theme.accent === id && !theme.accentFromArtwork
                    ? "border-foreground"
                    : "border-transparent",
                )}
                style={{
                  backgroundImage: `linear-gradient(135deg, ${ACCENTS[id].brand}, ${ACCENTS[id].brand2})`,
                }}
              />
            ))}
          </div>
        </Row>

        <Row label={t.settings.custom} hint={t.settings.customHint}>
          <div className="flex flex-wrap items-center gap-2">
            {COLOUR_SLOTS.map(({ token, label }) => (
              <label
                key={token}
                title={label}
                className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <input
                  type="color"
                  // Colour inputs need a hex value; the token may hold oklch,
                  // so the swatch starts neutral until the user picks.
                  value={
                    /^#/.test(theme.overrides[token] ?? "")
                      ? (theme.overrides[token] as string)
                      : "#808080"
                  }
                  onChange={(e) => setOverride(token, e.currentTarget.value)}
                  className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                />
                {label}
              </label>
            ))}
            {Object.keys(theme.overrides).length > 0 && (
              <button
                onClick={() => setTheme({ overrides: {} })}
                className="rounded-[var(--radius-control)] border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive hover:text-destructive"
              >
                {t.settings.customClear}
              </button>
            )}
          </div>
        </Row>

        <Row
          label={t.settings.accentArtwork}
          hint={
            // The switch keeps working under an achromatic palette, but what it
            // does there is different enough to say so: the cover's brightness is
            // kept and its hue is dropped. Silently applying a magenta accent to
            // a monochrome interface would be the alternative.
            PALETTES[theme.palette]?.achromatic
              ? t.settings.monoArtworkHint
              : t.settings.accentArtworkHint
          }
        >
          <Switch
            checked={theme.accentFromArtwork}
            onCheckedChange={(on) => setTheme({ accentFromArtwork: on })}
          />
        </Row>

        <Row label={t.settings.monoArtwork} hint={t.settings.monoArtworkHint}>
          <Switch
            checked={theme.monoArtwork}
            onCheckedChange={(on) => setTheme({ monoArtwork: on })}
          />
        </Row>
      </Group>


      {/* Locked on under Apple mode rather than hidden. A control that vanishes
          when a look is chosen reads as the app having lost a feature; one that
          is visibly held down says which look is holding it, and comes back the
          moment that look does not. `buildVars` is the authority — this only
          shows what it has already decided. */}
      <Group title={t.settings.glass} hint={t.settings.glassHint}>
        <Row label={t.settings.glassOn} hint={t.settings.glassPerf}>
          <Switch
            checked={theme.glass}
            onCheckedChange={(on) => setTheme({ glass: on })}
          />
        </Row>
      </Group>

      {/* ── Metrics ────────────────────────────────────────────────────── */}
      <Group
        title={t.settings.metrics}
        onReset={() => setTheme({ density: "cozy", uiScale: 100 })}
      >
        <Row label={t.settings.density}>
          <Segmented
            value={theme.density}
            onChange={(density) => setTheme({ density: density as Density })}
            options={[
              { id: "compact", get label() {
    return t.settings.compact;
  } },
              { id: "cozy", get label() {
    return t.settings.cozy;
  } },
              { id: "spacious", get label() {
    return t.settings.spacious;
  } },
            ]}
          />
        </Row>
        <Row label={t.settings.uiScale}>
          <Slider
            value={theme.uiScale}
            min={80}
            max={140}
            step={5}
            suffix="%"
            onChange={(uiScale) => setTheme({ uiScale })}
          />
        </Row>
      </Group>

      </>)}

      {section === "storage" && <StorageSettings />}

      {section === "backdrop" && (<>
      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      <Group
        title={t.settings.backdrop}
        hint={t.settings.backdropHint}
        onReset={() =>
          setBackdrop({ mode: "artwork", blur: 40, dim: 0.55, saturate: 1.2 })
        }
      >
        <Row label={t.settings.backdropMode}>
          <Segmented
            value={backdrop.mode}
            onChange={(mode) =>
              setBackdrop({ mode: mode as typeof backdrop.mode })
            }
            options={[
              { id: "none", get label() {
    return t.settings.backdropNone;
  } },
              { id: "artwork", get label() {
    return t.settings.backdropArtwork;
  } },
              { id: "image", get label() {
    return t.settings.backdropImage;
  } },
            ]}
          />
        </Row>

        <Row label={t.settings.backdropFile}>
          <div className="flex items-center gap-2">
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) pickImage(file);
                e.currentTarget.value = "";
              }}
            />
            <button
              onClick={() => imageInput.current?.click()}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
            >
              <glyphs.image className="h-4 w-4" />
              {t.settings.choose}
            </button>
            {backdrop.image && (
              <button
                onClick={() => setBackdrop({ image: null, mode: "none" })}
                aria-label={t.settings.remove}
                className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
              >
                <glyphs.trash className="h-4 w-4" />
              </button>
            )}
          </div>
        </Row>

        <Row label={t.settings.blur}>
          <Slider
            value={backdrop.blur}
            min={0}
            max={120}
            step={2}
            suffix="px"
            onChange={(blur) => setBackdrop({ blur })}
          />
        </Row>
        <Row label={t.settings.dim}>
          <Slider
            value={Math.round(backdrop.dim * 100)}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => setBackdrop({ dim: v / 100 })}
          />
        </Row>
        <Row label={t.settings.saturate}>
          <Slider
            value={Math.round(backdrop.saturate * 100)}
            min={0}
            max={200}
            step={5}
            suffix="%"
            onChange={(v) => setBackdrop({ saturate: v / 100 })}
          />
        </Row>
      </Group>

      {/* ── The full-screen player's lighting ─────────────────────────────── */}
      <Group
        title={t.settings.playerLight}
        hint={t.settings.playerLightHint}
        onReset={() =>
          setBackdrop({
            playerLight: DEFAULT_BACKDROP.playerLight,
            // Both lights, not just the one on screen: this is the section's
            // reset, and the numbers behind the switch are part of the section.
            playerLightStrength: { ...DEFAULT_BACKDROP.playerLightStrength },
            playerLightBrightness: { ...DEFAULT_BACKDROP.playerLightBrightness },
          })
        }
      >
        <Row label={t.settings.playerLightMode}>
          <Segmented
            value={backdrop.playerLight}
            onChange={(mode) =>
              setBackdrop({
                playerLight: mode as typeof backdrop.playerLight,
              })
            }
            options={[
              { id: "glow", get label() {
    return t.settings.playerLightGlow;
  } },
              { id: "blur", get label() {
    return t.settings.playerLightBlur;
  } },
            ]}
          />
        </Row>

        {/* Both sliders belong to the light that is on: the glow and the blur
            are lit differently, and one pair of numbers behind the switch meant
            re-tuning both every time you looked at the other one. Switching the
            mode above now brings its own numbers back with it. */}
        <Row label={t.settings.playerLightStrength}>
          <Slider
            value={Math.round(
              backdrop.playerLightStrength[backdrop.playerLight] * 100,
            )}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) =>
              setBackdrop({
                playerLightStrength: {
                  ...backdrop.playerLightStrength,
                  [backdrop.playerLight]: v / 100,
                },
              })
            }
          />
        </Row>

        <Row label={t.settings.playerLightBrightness}>
          <Slider
            value={Math.round(
              backdrop.playerLightBrightness[backdrop.playerLight] * 100,
            )}
            min={50}
            max={200}
            step={10}
            suffix="%"
            onChange={(v) =>
              setBackdrop({
                playerLightBrightness: {
                  ...backdrop.playerLightBrightness,
                  [backdrop.playerLight]: v / 100,
                },
              })
            }
          />
        </Row>
      </Group>

      {/* ── Ambient effects ───────────────────────────────────────────────── */}
      <Group
        title={t.settings.effects}
        hint={t.settings.effectsHint}
        onReset={() => setBackdrop({ effect: "none", effectIntensity: 1 })}
      >
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {(["none", ...EFFECT_IDS] as const).map((id) => (
            <button
              key={id}
              onClick={() => setBackdrop({ effect: id })}
              className={cn(
                "rounded-[var(--radius-control)] border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
                backdrop.effect === id
                  ? "border-brand bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {t.settings.effectNames[id]}
            </button>
          ))}
        </div>

        {backdrop.effect !== "none" && (
          <Row label={t.settings.effectIntensity}>
            <Slider
              value={Math.round(backdrop.effectIntensity * 100)}
              min={25}
              max={200}
              step={25}
              suffix="%"
              onChange={(v) => setBackdrop({ effectIntensity: v / 100 })}
            />
          </Row>
        )}
      </Group>

      </>)}

      
      {section === "playback" && (<>
      {/* ── Playback ───────────────────────────────────────────────────── */}
      <Group
        title={t.settings.playback}
        onReset={() => {
          setAutoplayNext(true);
          setRememberVolume(true);
        }}
      >
        <Row label={t.settings.autoplayNext} hint={t.settings.autoplayNextHint}>
          <Switch checked={autoplayNext} onCheckedChange={setAutoplayNext} />
        </Row>
        <Row
          label={t.settings.rememberVolume}
          hint={t.settings.rememberVolumeHint}
        >
          <Switch checked={rememberVolume} onCheckedChange={setRememberVolume} />
        </Row>
      </Group>

      {/* ── Data and offline ───────────────────────────────────────────── */}
      {/* One switch, and the hint is doing as much work as the switch: playing
          a downloaded track from disk is not a preference and has no toggle —
          it is simply what the player does. This is the stronger statement,
          for a metered connection or none at all. */}
      <Group title={t.settings.offline} hint={t.settings.offlineHint}>
        <Row label={t.settings.offlineOnly} hint={t.settings.offlineOnlyHint}>
          <Switch checked={offlineOnly} onCheckedChange={setOfflineOnly} />
        </Row>
      </Group>

      </>)}

      {section === "audio" && <AudioSettings />}

      {/* Presets render inside Appearance rather than as their own section.
          Five tabs do not fit across 360px — the strip scrolled sideways and
          the last one had to be hunted for — and "save the current look" was
          never a different subject from the look itself. */}
      {section === "appearance" && (<>
      {/* ── Presets ────────────────────────────────────────────────────── */}
      </>)}
      </div>
      </div>
    </div>
  );
}




/** The colour tokens worth exposing by hand; the rest derive from these. */
const COLOUR_SLOTS: { token: string; label: string }[] = [
  { token: "--background", get label() {
    return t.settings.slotBackground;
  } },
  { token: "--card", get label() {
    return t.settings.slotSurface;
  } },
  { token: "--foreground", get label() {
    return t.settings.slotText;
  } },
  { token: "--muted-foreground", get label() {
    return t.settings.slotMuted;
  } },
  { token: "--border", get label() {
    return t.settings.slotBorder;
  } },
  { token: "--brand", get label() {
    return t.settings.slotBrand;
  } },
  { token: "--brand-2", get label() {
    return t.settings.slotBrand2;
  } },
];

type SectionId =
  | "appearance"
  | "backdrop"
  | "audio"
  | "playback"
  | "storage";

/**
 * Every glyph this page draws, in both idioms.
 *
 * Settings is where the icons are most visible and most obviously not Apple's —
 * a gear, a palette, a ruler, a checkmark — so the page picks a set rather than
 * importing one. Lucide's is the default; Apple mode swaps the lot at once,
 * which is the only way that reads as deliberate instead of as a mix.
 */
interface GlyphSet {
  check: Glyph;
  chevronDown: Glyph;
  reset: Glyph;
  trash: Glyph;
  upload: Glyph;
  download: Glyph;
  image: Glyph;
  dark: Glyph;
  light: Glyph;
  system: Glyph;
  sections: Record<SectionId, Glyph>;
}

const LUCIDE_GLYPHS: GlyphSet = {
  check: Check,
  chevronDown: ChevronDown,
  reset: RotateCcw,
  trash: Trash2,
  upload: Upload,
  download: Download,
  image: ImageIcon,
  dark: Moon,
  light: Sun,
  system: Monitor,
  sections: {
    appearance: PaletteIcon,
    backdrop: Wallpaper,
    audio: Volume2,
    playback: SlidersHorizontal,
    storage: HardDrive,
  },
};

/**
 * The glyphs this screen draws with.
 *
 * One set now, and still a function rather than the constant itself: every
 * nested building block calls it, and a second set is the kind of thing that
 * comes back.
 */
function useGlyphs(): GlyphSet {
  return LUCIDE_GLYPHS;
}

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "appearance", get label() {
    return t.settings.secAppearance;
  } },
  { id: "backdrop", get label() {
    return t.settings.backdrop;
  } },
  { id: "audio", get label() {
    return t.audio.title;
  } },
  { id: "playback", get label() {
    return t.settings.playback;
  } },
  { id: "storage", get label() {
    return t.settings.secStorage;
  } },
];

/* ── building blocks ──────────────────────────────────────────────────── */

function Group({
  title,
  hint,
  onReset,
  muted = false,
  children,
}: {
  title: string;
  hint?: string;
  /** Shows a reset control in the heading when provided. */
  onReset?: () => void;
  /**
   * Greyed out and inert: something else is overriding what this section
   * controls, so its rows are shown for reference and cannot be operated. The
   * stored choice is untouched and comes back into effect when the override is
   * switched off.
   */
  muted?: boolean;
  children: React.ReactNode;
}) {
  const glyphs = useGlyphs();
  return (
    <section
      className={cn(
        "flex flex-col gap-2 transition-opacity duration-[var(--motion-slow)]",
        muted && "pointer-events-none select-none opacity-45",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="group-title">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {onReset && (
          <button
            onClick={onReset}
            title={t.settings.resetSection}
            aria-label={t.settings.resetSection}
            className="mt-1 flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <glyphs.reset className="h-3 w-3" />
            {t.settings.resetSection}
          </button>
        )}
      </div>
      <div className="panel flex flex-col divide-y divide-border overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (id: string) => void;
  options: { id: string; label: string; Icon?: Glyph }[];
}) {
  return (
    // `data-segmented` is a styling hook: Apple mode turns this into a
    // UISegmentedControl, which needs the container and the selected button
    // together and cannot get at either through the utilities.
    <div
      data-segmented
      className="flex gap-1 rounded-[var(--radius-control)] border border-border p-1"
    >
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1 text-sm transition-colors duration-[var(--motion-fast)]",
            value === id
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <span className="label">{label}</span>
        </button>
      ))}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  // Where the fill stops. A settings slider does not always start at zero —
  // brightness runs 50 to 200 — so it is the position within the range, not the
  // value.
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5">
      {/* Painted rather than left to the browser, and the same pair of classes
          the player's volume uses — so a skin restyles every slider in the app
          at once, and the two are the same weight when you look at them one
          after the other. `accent-color` draws a track WebKit decides the
          height of, and it decides thicker than anything else here: a fat bar
          with a big white knob in a row of hairlines.

          112px wide, not 160. A settings row is a label and a control, and the
          control was running most of the width of the panel for a value with
          five useful positions in it. */}
      <div className="group/slider relative h-4 w-28">
        <div className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-secondary">
          <div
            className="seek-fill brand-gradient h-full rounded-[var(--radius-round)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[var(--radius-round)]
            [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:opacity-0
            [&::-webkit-slider-thumb]:transition-opacity
            group-hover/slider:[&::-webkit-slider-thumb]:opacity-100"
        />
      </div>
      {/* `.readout` rather than a bare mono class: the project keeps JetBrains
          Mono to digits and reaches it through this one name, so a font change
          lands everywhere at once. `tabular-nums` comes with it, which is what
          stops the row twitching as the number changes width. */}
      <span className="readout w-10 text-right text-xs text-muted-foreground">
        {value}
        {suffix}
      </span>
    </div>
  );
}



