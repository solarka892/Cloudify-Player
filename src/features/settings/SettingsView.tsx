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
  Trash2,
  Upload,
  Volume2,
  Wallpaper,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AudioSettings } from "./AudioSettings";
import {
  BUILTIN_PRESETS,
  useSettingsStore,
  type LayoutId,
  type Preset,
} from "@/stores/useSettingsStore";
import {
  PALETTES,
  PALETTE_IDS,
  HIDDEN_PALETTE_IDS,
  ACCENTS,
  ACCENT_IDS,
} from "@/theme/palettes";
import { SKINS, SKIN_IDS, type SkinId } from "@/theme/skins";
import { EFFECT_IDS } from "@/theme/particles";
import type { Density, ThemeMode } from "@/theme/apply";
import {
  LOCALES,
  LOCALE_NAMES,
  t,
  type Locale,
} from "@/i18n";
import {
  AppleAppearance,
  AppleCheck,
  AppleChevronDown,
  AppleDisplay,
  AppleDownload,
  AppleMoon,
  ApplePhoto,
  ApplePlayCircle,
  AppleReset,
  AppleSpeaker,
  AppleSun,
  AppleTrash,
  AppleUpload,
  type Glyph,
} from "@/features/apple/icons";
import { useCompact } from "@/hooks/useCompact";
import { scrollViewToTop } from "@/lib/scroll";
import { hasWindowChrome } from "@/lib/window";
import { cn } from "@/lib/utils";

/**
 * Everything the user can bend.
 *
 * Appearance is presented along the same three axes the theme engine uses —
 * layout, skin, palette — because they compose freely and pretending otherwise
 * would just hide combinations from the user.
 */
export function SettingsView() {
  const compact = useCompact();
  const layout = useSettingsStore((s) => s.layout);
  const theme = useSettingsStore((s) => s.theme);
  const backdrop = useSettingsStore((s) => s.backdrop);
  const presets = useSettingsStore((s) => s.presets);
  const unlocked = useSettingsStore((s) => s.unlocked);
  const nativeFrame = useSettingsStore((s) => s.nativeFrame);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const rememberVolume = useSettingsStore((s) => s.rememberVolume);

  const setLayout = useSettingsStore((s) => s.setLayout);
  const setNativeFrame = useSettingsStore((s) => s.setNativeFrame);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setBackdrop = useSettingsStore((s) => s.setBackdrop);
  const setBackdropImage = useSettingsStore((s) => s.setBackdropImage);
  const setOverride = useSettingsStore((s) => s.setOverride);
  const resetTheme = useSettingsStore((s) => s.resetTheme);
  const savePreset = useSettingsStore((s) => s.savePreset);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const deletePreset = useSettingsStore((s) => s.deletePreset);
  const exportTheme = useSettingsStore((s) => s.exportTheme);
  const importTheme = useSettingsStore((s) => s.importTheme);
  const setAutoplayNext = useSettingsStore((s) => s.setAutoplayNext);
  const locale = useSettingsStore((s) => s.locale);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setRememberVolume = useSettingsStore((s) => s.setRememberVolume);

  const glyphs = useGlyphs();

  const [section, setSection] = useState<SectionId>("appearance");
  const [presetName, setPresetName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const themeInput = useRef<HTMLInputElement>(null);

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

  function pickTheme(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const error = importTheme(String(reader.result));
      setNotice(error ? t.settings.importFailed : t.settings.imported);
    };
    reader.readAsText(file);
  }

  function downloadTheme() {
    const blob = new Blob([exportTheme(presetName || "cloudify theme")], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(presetName || "cloudify-theme").replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-full gap-6">
      {/* Section list — settings are browsed, not scrolled through. */}
      <nav className="settings-nav hidden w-48 shrink-0 flex-col gap-0.5 self-start md:flex">
        <h1
          className="mb-2 px-2 text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t.nav.settings}
        </h1>
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
      <Group title={t.settings.builtin} hint={t.settings.builtinHint}>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {BUILTIN_PRESETS.map((preset) => {
            const active =
              theme.skin === preset.theme.skin &&
              theme.palette === preset.theme.palette;
            return (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-control)] border p-2 pr-3.5 text-left transition-colors duration-[var(--motion-fast)]",
                  active
                    ? "border-brand bg-accent"
                    : "border-border hover:bg-accent/60",
                )}
              >
                <PresetSwatch preset={preset} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{preset.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.settings.skinHints[preset.theme.skin]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Group>

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

      {/* ── Layout ─────────────────────────────────────────────────────── */}
      {/* Not offered on a phone: `AppShell` draws the bottom tab bar whenever
          the window is compact and never consults `layout` there, so all three
          choices would look identical and only the widest one is even a shape a
          360px screen could take. The setting itself is kept — the same install
          may be a desktop window tomorrow. */}
      {!compact && (
      <Group
        title={t.settings.layout}
        hint={t.settings.layoutHint}
        onReset={() => setLayout("rail")}
      >
        <div className="grid grid-cols-3 gap-2 p-3">
          {(
            [
              { id: "rail", get label() {
    return t.settings.layoutRail;
  }, art: RAIL_ART },
              { id: "top", get label() {
    return t.settings.layoutTop;
  }, art: TOP_ART },
              { id: "sidebar", get label() {
    return t.settings.layoutSidebar;
  }, art: SIDEBAR_ART },
            ] as { id: LayoutId; label: string; art: string }[]
          ).map((option) => (
            <button
              key={option.id}
              onClick={() => setLayout(option.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-[var(--radius-control)] border p-3 transition-colors duration-[var(--motion-fast)]",
                layout === option.id
                  ? "border-brand bg-accent"
                  : "border-border hover:bg-accent/60",
              )}
            >
              <pre className="text-[7px] leading-[1.15] text-muted-foreground">
                {option.art}
              </pre>
              <span className="label text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </Group>
      )}

      {/* ── Apple mode ─────────────────────────────────────────────────── */}
      {/* Above skin and colour on purpose: it replaces both, and the two
          sections below say so while it is on. */}
      <Group title={t.settings.apple}>
        <Row label={t.settings.appleOn} hint={t.settings.appleFont}>
          <Switch
            checked={theme.apple}
            // Switching on also selects the iOS palette, because that is the
            // colour the mode is designed around — but it selects it rather
            // than enforcing it, so the picker below still works and moving off
            // it is a choice the user gets to make. Switching off leaves it
            // alone: it is an ordinary palette and may well be what they want.
            onCheckedChange={(apple) =>
              setTheme(apple ? { apple, palette: "apple" } : { apple })
            }
          />
        </Row>
      </Group>

      {/* ── Skin ───────────────────────────────────────────────────────── */}
      <Group
        title={t.settings.skin}
        hint={theme.apple ? t.settings.appleOverrides : t.settings.skinHint}
        muted={theme.apple}
      >
        <div className="flex flex-col divide-y divide-border">
          {SKIN_IDS.map((id) => {
            const skin = SKINS[id];
            return (
              <button
                key={id}
                onClick={() => setTheme({ skin: id })}
                className="flex items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent/60"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    theme.skin === id
                      ? "border-brand bg-brand text-white"
                      : "border-border",
                  )}
                >
                  {theme.skin === id && <glyphs.check className="h-3 w-3" />}
                </span>
                {/* Drawn from the skin's own tokens, so it is the skin rather
                    than a picture of it — a new skin gets a preview for free,
                    and one that changes its radius changes here too. */}
                <SkinSwatch id={id} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{skin.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.settings.skinHints[id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
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
                    "h-8 w-8 overflow-hidden rounded-full border-2 transition-transform duration-[var(--motion-fast)] hover:scale-110",
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
                  "h-7 w-7 rounded-full border-2 transition-transform duration-[var(--motion-fast)] hover:scale-110",
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

      {/* ── Window ─────────────────────────────────────────────────────── */}
      {/* Desktop only, and not because of layout: there is no window to frame on
          a phone, and `TitleBar` is not rendered there at all. */}
      {hasWindowChrome && (
        <Group title={t.settings.window}>
          <Row label={t.settings.nativeFrame} hint={t.settings.nativeFrameHint}>
            <Switch checked={nativeFrame} onCheckedChange={setNativeFrame} />
          </Row>
        </Group>
      )}

      {/* One switch, and which flag it holds follows the mode — exactly as
          `buildVars` reads them. Two would be a lie: in Apple mode the glass
          setting has no effect, and a second toggle for the same idea just
          invites the user to find the one that does nothing. */}
      <Group title={t.settings.glass} hint={t.settings.glassHint}>
        <Row
          label={theme.apple ? t.settings.appleTransparency : t.settings.glassOn}
          hint={
            theme.apple ? t.settings.appleTransparencyHint : t.settings.glassPerf
          }
        >
          <Switch
            checked={theme.apple ? theme.appleTransparency : theme.glass}
            onCheckedChange={(on) =>
              setTheme(theme.apple ? { appleTransparency: on } : { glass: on })
            }
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

      </>)}

      {section === "audio" && <AudioSettings />}

      {/* Presets render inside Appearance rather than as their own section.
          Five tabs do not fit across 360px — the strip scrolled sideways and
          the last one had to be hunted for — and "save the current look" was
          never a different subject from the look itself. */}
      {section === "appearance" && (<>
      {/* ── Presets ────────────────────────────────────────────────────── */}
      <Group title={t.settings.presets} hint={t.settings.presetsHint}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.currentTarget.value)}
            placeholder={t.settings.presetName}
            className="min-w-40 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => {
              if (!presetName.trim()) return;
              savePreset(presetName.trim());
              setPresetName("");
            }}
            className="rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
          >
            {t.settings.save}
          </button>
          <button
            onClick={downloadTheme}
            className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
          >
            <glyphs.download className="h-4 w-4" />
            {t.settings.export}
          </button>
          <input
            ref={themeInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) pickTheme(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            onClick={() => themeInput.current?.click()}
            className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
          >
            <glyphs.upload className="h-4 w-4" />
            {t.settings.import}
          </button>
        </div>

        {presets.length > 0 && (
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {presets.map((preset) => (
              <li key={preset.id} className="flex items-center gap-2 px-4 py-2">
                <button
                  onClick={() => applyPreset(preset.id)}
                  className="flex-1 truncate text-left text-sm transition-colors duration-[var(--motion-fast)] hover:text-brand"
                >
                  {preset.name}
                </button>
                <span className="text-xs text-muted-foreground">
                  {SKINS[preset.theme.skin]?.name} ·{" "}
                  {PALETTES[preset.theme.palette]?.name}
                </span>
                <button
                  onClick={() => deletePreset(preset.id)}
                  aria-label={t.settings.remove}
                  className="rounded p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
                >
                  <glyphs.trash className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border px-4 py-3">
          <button
            onClick={resetTheme}
            className="text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-destructive"
          >
            {t.settings.reset}
          </button>
        </div>
      </Group>
      </>)}
      </div>
      </div>
    </div>
  );
}

/**
 * A skin, at 36px.
 *
 * Form only, drawn from the skin's own `vars` — a page, a panel on it, and the
 * ambient light if the skin has one. Colour comes from whatever palette is
 * active, which is not a shortcut: the two axes really are independent, and a
 * swatch that invented its own colours would be advertising a combination the
 * user has not chosen.
 *
 * Shown as the skin *frosts*, using `glass.alpha` rather than the opaque pair in
 * `vars`, because the difference between the four skins is mostly in how they
 * frost and a row of four opaque squares says nothing.
 */
function SkinSwatch({ id }: { id: SkinId }) {
  const skin = SKINS[id];
  const glow = Number(skin.vars["--glow"]) || 0;
  return (
    <span
      aria-hidden
      className="relative block h-9 w-9 shrink-0 overflow-hidden border border-border bg-background"
      style={{ borderRadius: skin.vars["--radius"] }}
    >
      {glow > 0 && <span className="swatch-arc" style={{ opacity: glow }} />}
      <span
        className="absolute inset-x-1 bottom-1 top-3.5 border border-border"
        style={{
          borderRadius: skin.vars["--radius-control"],
          background: `color-mix(in srgb, var(--card) ${skin.glass.alpha}, transparent)`,
          boxShadow: skin.vars["--shadow-1"],
        }}
      />
    </span>
  );
}

/**
 * A built-in preset, at 44px.
 *
 * Unlike `SkinSwatch` this one *does* name its own colours: a preset is the one
 * thing in Settings that legitimately fixes all three axes at once, so showing it
 * in the palette it selects is showing what the button will actually do.
 */
function PresetSwatch({ preset }: { preset: Preset }) {
  const skin = SKINS[preset.theme.skin] ?? SKINS.aurora;
  const palette = PALETTES[preset.theme.palette] ?? PALETTES.midnight;
  const shade = preset.theme.mode === "light" ? palette.light : palette.dark;
  const glow = Number(skin.vars["--glow"]) || 0;
  return (
    <span
      aria-hidden
      className="relative block h-11 w-11 shrink-0 overflow-hidden"
      style={{
        borderRadius: skin.vars["--radius"],
        background: shade.bg,
        border: `1px solid ${shade.line}`,
      }}
    >
      {glow > 0 && (
        <span
          className="swatch-arc"
          style={{ opacity: glow, borderColor: shade.text }}
        />
      )}
      <span
        className="absolute inset-x-1.5 bottom-1.5 top-5"
        style={{
          borderRadius: skin.vars["--radius-control"],
          background: `color-mix(in srgb, ${shade.surface} ${preset.theme.glass ? skin.glass.alpha : "100%"}, transparent)`,
          border: `1px solid ${shade.line}`,
        }}
      />
    </span>
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
  | "playback";

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
  },
};

const APPLE_GLYPHS: GlyphSet = {
  check: AppleCheck,
  chevronDown: AppleChevronDown,
  reset: AppleReset,
  trash: AppleTrash,
  upload: AppleUpload,
  download: AppleDownload,
  image: ApplePhoto,
  dark: AppleMoon,
  light: AppleSun,
  system: AppleDisplay,
  sections: {
    appearance: AppleAppearance,
    backdrop: ApplePhoto,
    audio: AppleSpeaker,
    playback: ApplePlayCircle,
  },
};

/** Which set is in force. A hook so nested building blocks can ask too. */
function useGlyphs(): GlyphSet {
  return useSettingsStore((s) => s.theme.apple)
    ? APPLE_GLYPHS
    : LUCIDE_GLYPHS;
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

/* Tiny layout thumbnails — cheaper and sharper than shipping images. */
const RAIL_ART = `┌─┬──────┐
│▪│▁▁▁▁▁ │
│▪│▤▤ ▤▤ │
│▪│▤▤ ▤▤ │
├─┴──────┤
│ ▶ ──○─ │
└────────┘`;

const TOP_ART = `┌────────┐
│▪ ▪ ▪  ▪│
├────────┤
│ ▁▁▁▁▁▁ │
│ ▤▤ ▤▤  │
├────────┤
│ ▶ ──○─ │
└────────┘`;

const SIDEBAR_ART = `┌────┬───┐
│ ▪  │▁▁▁│
│ ▪  │▤▤ │
│ ──  │▤▤ │
│ ▸  │   │
├────┴───┤
│ ▶ ──○─ │
└────────┘`;
