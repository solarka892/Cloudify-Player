import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  ACCENTS,
  ACCENT_IDS,
  useSettingsStore,
  type AccentId,
  type ThemeMode,
} from "@/stores/useSettingsStore";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: "dark", label: t.settings.themeDark, Icon: Moon },
  { id: "light", label: t.settings.themeLight, Icon: Sun },
  { id: "system", label: t.settings.themeSystem, Icon: Monitor },
];

export function SettingsView() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const autoplayNext = useSettingsStore((s) => s.autoplayNext);
  const rememberVolume = useSettingsStore((s) => s.rememberVolume);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const setAutoplayNext = useSettingsStore((s) => s.setAutoplayNext);
  const setRememberVolume = useSettingsStore((s) => s.setRememberVolume);

  return (
    <section className="flex w-full max-w-2xl flex-col gap-6">
      <Group title={t.settings.appearance}>
        <Row label={t.settings.theme}>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {THEME_OPTIONS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  theme === id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </Row>

        <Row label={t.settings.accent}>
          <div className="flex gap-2">
            {ACCENT_IDS.map((id) => (
              <AccentSwatch
                key={id}
                id={id}
                selected={accent === id}
                onSelect={setAccent}
              />
            ))}
          </div>
        </Row>
      </Group>

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
    </section>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </div>
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
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function AccentSwatch({
  id,
  selected,
  onSelect,
}: {
  id: AccentId;
  selected: boolean;
  onSelect: (id: AccentId) => void;
}) {
  const { brand, brand2 } = ACCENTS[id];
  return (
    <button
      onClick={() => onSelect(id)}
      aria-label={id}
      aria-pressed={selected}
      style={{ backgroundImage: `linear-gradient(135deg, ${brand}, ${brand2})` }}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
      )}
    >
      {selected && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
    </button>
  );
}
