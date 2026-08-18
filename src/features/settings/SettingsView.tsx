import { useEffect, useState } from "react";
import {
  ChevronDown,
  Flag,
  HardDrive,
  Palette as PaletteIcon,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AudioSettings } from "./AudioSettings";
import { NitSettings } from "./NitSettings";
import { StorageSettings } from "./StorageSettings";

import { ACCENTS, accentValue, type AccentId } from "@/theme/palettes";

import { useSettingsStore } from "@/stores/useSettingsStore";
import { resolveDark, type ThemeMode } from "@/theme/apply";
import {
  LOCALES,
  LOCALE_NAMES,
  t,
  type Locale,
} from "@/i18n";
import { scrollViewToTop } from "@/lib/scroll";
import { cn } from "@/lib/utils";
import { ViewHead } from "@/components/ViewHead";


/**
 * Everything the user can bend.
 *
 * Appearance used to be most of this screen: ready-made looks, a layout picker, a
 * skin picker, seventeen palettes, a wallpaper with blur and dim sliders, falling
 * particles, and saved presets to name combinations of all of it. That was the
 * old app looking back at the user out of its own settings — a screen offering
 * choices the app no longer makes.
 *
 * What is left is what was always a preference rather than an unanswered design
 * question: which printing the sheet is on, which band of the ramp accents it,
 * whether the playing cover picks that band, and how large it is all drawn.
 */
export function SettingsView() {
  const theme = useSettingsStore((s) => s.theme);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const offlineOnly = useSettingsStore((s) => s.offlineOnly);
  const setOfflineOnly = useSettingsStore((s) => s.setOfflineOnly);
  const rememberVolume = useSettingsStore((s) => s.rememberVolume);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAutoplayNext = useSettingsStore((s) => s.setAutoplayNext);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setRememberVolume = useSettingsStore((s) => s.setRememberVolume);


  const [section, setSection] = useState<SectionId>("appearance");

  // The section list is sticky, so a section can be picked from far down a long
  // one. The next section starts at its own top rather than at that offset.
  useEffect(() => {
    scrollViewToTop();
  }, [section]);




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
          const Icon = SECTION_ICONS[id];
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

      <div key={section} className="stack-lg view-enter">
      {section === "appearance" && (<>
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
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </Row>
      </Group>

      {/* ── The sheet ──────────────────────────────────────────────────── */}
      <Group
        title={t.settings.colour}
        hint={t.settings.sheetHint}
        onReset={() =>
          setTheme({
            mode: "dark",
            accent: null,
            accentFromArtwork: true,
            uiScale: 100,
            overrides: {},
          })
        }
      >
        {/* Which stock the sheet is printed on. Not a palette picker: it is the
            same sheet either way, and that is why there are two entries here
            instead of seventeen. */}
        <Row label={t.settings.printing}>
          <Segmented
            value={theme.mode}
            onChange={(mode) => setTheme({ mode: mode as ThemeMode })}
            options={[
              { id: "light", get label() {
                return t.settings.themeLight;
              } },
              { id: "dark", get label() {
                return t.settings.themeDark;
              } },
              { id: "system", get label() {
                return t.settings.themeSystem;
              } },
            ]}
          />
        </Row>

        {/* The accent, and the five bands are the whole choice. Anything outside
            the ramp would be a colour with no entry in the legend. */}
        <Row label={t.settings.accent} hint={t.settings.accentHint}>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setTheme({ accent: null, accentFromArtwork: false })}
              aria-pressed={!theme.accent && !theme.accentFromArtwork}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius)] border-[1.5px] px-2 py-1 text-xs transition-colors duration-[var(--t-state)]",
                !theme.accent && !theme.accentFromArtwork
                  ? "border-water text-foreground"
                  : "border-contour text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className="h-3 w-5 rounded-[1px] border-[1.5px] border-contour"
                style={{ background: "var(--water)" }}
              />
              {t.settings.water}
            </button>
            {ACCENTS.map((id) => (
              <button
                key={id}
                onClick={() => setTheme({ accent: id, accentFromArtwork: false })}
                aria-pressed={theme.accent === id && !theme.accentFromArtwork}
                aria-label={id}
                className={cn(
                  "h-6 w-8 rounded-[var(--radius)] border-[1.5px] transition-colors duration-[var(--t-state)]",
                  theme.accent === id && !theme.accentFromArtwork
                    ? "border-water"
                    : "border-contour",
                )}
                style={{
                  background: accentValue(id as AccentId, resolveDark(theme.mode)),
                }}
              />
            ))}
          </div>
        </Row>

        <Row label={t.settings.accentArtwork} hint={t.settings.accentArtworkHint}>
          <Switch
            checked={theme.accentFromArtwork}
            onCheckedChange={(on) => setTheme({ accentFromArtwork: on })}
          />
        </Row>

        {/* Scale, not density: the sheet is drawn larger, and nothing on it moves
            relative to anything else. */}
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

      {section === "nit" && <NitSettings />}

      {section === "storage" && <StorageSettings />}

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




type SectionId = "appearance" | "nit" | "audio" | "playback" | "storage";

/**
 * One glyph per section, from one set.
 *
 * There used to be two of these tables and a hook that chose between them, so
 * Apple mode could swap every icon on the page at once. One idiom, one set.
 */
const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  appearance: PaletteIcon,
  nit: Flag,
  audio: Volume2,
  playback: SlidersHorizontal,
  storage: HardDrive,
};

/** The sections, in the order they are browsed. Labels are getters: `t` is a
    live binding and a table built at import time freezes its language. */
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "appearance", get label() {
    return t.settings.secAppearance;
  } },
  { id: "nit", get label() {
    return t.settings.secNit;
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
            <RotateCcw className="h-3 w-3" />
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
  options: { id: string; label: string; Icon?: LucideIcon }[];
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
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="h-1 w-40 cursor-pointer accent-[var(--brand)]"
      />
      <span className="w-12 text-right font-mono text-xs text-muted-foreground">
        {value}
        {suffix}
      </span>
    </div>
  );
}



