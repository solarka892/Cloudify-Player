import { useRef, useState } from "react";
import {
  Check,
  Download,
  Image as ImageIcon,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore, type LayoutId } from "@/stores/useSettingsStore";
import { PALETTES, PALETTE_IDS, ACCENTS, ACCENT_IDS } from "@/theme/palettes";
import { SKINS, SKIN_IDS } from "@/theme/skins";
import type { Density, ThemeMode } from "@/theme/apply";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Everything the user can bend.
 *
 * Appearance is presented along the same three axes the theme engine uses —
 * layout, skin, palette — because they compose freely and pretending otherwise
 * would just hide combinations from the user.
 */
export function SettingsView() {
  const layout = useSettingsStore((s) => s.layout);
  const theme = useSettingsStore((s) => s.theme);
  const backdrop = useSettingsStore((s) => s.backdrop);
  const presets = useSettingsStore((s) => s.presets);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const rememberVolume = useSettingsStore((s) => s.rememberVolume);

  const setLayout = useSettingsStore((s) => s.setLayout);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setBackdrop = useSettingsStore((s) => s.setBackdrop);
  const setBackdropImage = useSettingsStore((s) => s.setBackdropImage);
  const resetTheme = useSettingsStore((s) => s.resetTheme);
  const savePreset = useSettingsStore((s) => s.savePreset);
  const applyPreset = useSettingsStore((s) => s.applyPreset);
  const deletePreset = useSettingsStore((s) => s.deletePreset);
  const exportTheme = useSettingsStore((s) => s.exportTheme);
  const importTheme = useSettingsStore((s) => s.importTheme);
  const setAutoplayNext = useSettingsStore((s) => s.setAutoplayNext);
  const setRememberVolume = useSettingsStore((s) => s.setRememberVolume);

  const [presetName, setPresetName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const themeInput = useRef<HTMLInputElement>(null);

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
    <div className="stack-lg max-w-3xl">
      <h1
        className="text-3xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t.nav.settings}
      </h1>

      {notice && (
        <p className="panel px-4 py-2 text-sm text-muted-foreground">{notice}</p>
      )}

      {/* ── Layout ─────────────────────────────────────────────────────── */}
      <Group title={t.settings.layout} hint={t.settings.layoutHint}>
        <div className="grid grid-cols-3 gap-2 p-3">
          {(
            [
              { id: "rail", label: t.settings.layoutRail, art: RAIL_ART },
              { id: "top", label: t.settings.layoutTop, art: TOP_ART },
              { id: "sidebar", label: t.settings.layoutSidebar, art: SIDEBAR_ART },
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

      {/* ── Skin ───────────────────────────────────────────────────────── */}
      <Group title={t.settings.skin} hint={t.settings.skinHint}>
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
                  {theme.skin === id && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{skin.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {skin.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      {/* ── Colour ─────────────────────────────────────────────────────── */}
      <Group title={t.settings.colour}>
        <Row label={t.settings.theme}>
          <Segmented
            value={theme.mode}
            onChange={(mode) => setTheme({ mode: mode as ThemeMode })}
            options={[
              { id: "dark", label: t.settings.themeDark, Icon: Moon },
              { id: "light", label: t.settings.themeLight, Icon: Sun },
              { id: "system", label: t.settings.themeSystem, Icon: Monitor },
            ]}
          />
        </Row>

        <Row label={t.settings.palette}>
          <div className="flex flex-wrap gap-2">
            {PALETTE_IDS.map((id) => {
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
                  style={{
                    background: `conic-gradient(${shade.bg} 0 33%, ${shade.surface2} 0 66%, ${shade.brand} 0)`,
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

        <Row
          label={t.settings.accentArtwork}
          hint={t.settings.accentArtworkHint}
        >
          <Switch
            checked={theme.accentFromArtwork}
            onCheckedChange={(on) => setTheme({ accentFromArtwork: on })}
          />
        </Row>
      </Group>

      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      <Group title={t.settings.backdrop} hint={t.settings.backdropHint}>
        <Row label={t.settings.backdropMode}>
          <Segmented
            value={backdrop.mode}
            onChange={(mode) =>
              setBackdrop({ mode: mode as typeof backdrop.mode })
            }
            options={[
              { id: "none", label: t.settings.backdropNone },
              { id: "artwork", label: t.settings.backdropArtwork },
              { id: "image", label: t.settings.backdropImage },
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
              <ImageIcon className="h-4 w-4" />
              {t.settings.choose}
            </button>
            {backdrop.image && (
              <button
                onClick={() => setBackdrop({ image: null, mode: "none" })}
                aria-label={t.settings.remove}
                className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
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

      {/* ── Metrics ────────────────────────────────────────────────────── */}
      <Group title={t.settings.metrics}>
        <Row label={t.settings.density}>
          <Segmented
            value={theme.density}
            onChange={(density) => setTheme({ density: density as Density })}
            options={[
              { id: "compact", label: t.settings.compact },
              { id: "cozy", label: t.settings.cozy },
              { id: "spacious", label: t.settings.spacious },
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

      {/* ── Playback ───────────────────────────────────────────────────── */}
      <Group title={t.settings.playback}>
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
            <Download className="h-4 w-4" />
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
            <Upload className="h-4 w-4" />
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
                  <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

/* ── building blocks ──────────────────────────────────────────────────── */

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="label text-lg font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
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
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
  options: { id: string; label: string; Icon?: typeof Sun }[];
}) {
  return (
    <div className="flex gap-1 rounded-[var(--radius-control)] border border-border p-1">
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
