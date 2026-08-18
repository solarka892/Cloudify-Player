import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { diaryPrune } from "@/lib/store";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * The Nit group: the twelve features' switches, in one place.
 *
 * Two of these are not stored here and are shown anyway — the artwork treatment
 * and the print shift belong to `ThemeState`, because they are appearance and
 * travel in an exported theme. They are rendered from the same fields the
 * Appearance page renders them from, not copied: one switch, two places to find
 * it, and no way for the two to disagree.
 */
export function NitSettings() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const audio = useSettingsStore((s) => s.audio);
  const setAudio = useSettingsStore((s) => s.setAudio);
  const nit = useSettingsStore((s) => s.nit);
  const setNit = useSettingsStore((s) => s.setNit);

  return (
    <div className="stack-lg">
      <Group title={t.settings.secNit} hint={t.settings.nitHint}>
        <Toggle
          label={t.settings.monoArtwork}
          hint={t.settings.monoArtworkHint}
          value={theme.monoArtwork}
          onChange={(monoArtwork) => setTheme({ monoArtwork })}
        />
        <Toggle
          label={t.settings.printShift}
          hint={t.settings.printShiftHint}
          value={theme.printShift}
          onChange={(printShift) => setTheme({ printShift })}
        />
        <Toggle
          label={t.settings.resume}
          hint={t.settings.resumeHint}
          value={nit.resume}
          onChange={(resume) => setNit({ resume })}
        />
      </Group>

      <Group title={t.audio.title}>
        <Toggle
          label={t.settings.loudness}
          hint={t.settings.loudnessHint}
          value={audio.levelling}
          onChange={(levelling) => setAudio({ levelling })}
        />
        <Toggle
          label={t.settings.night}
          hint={t.settings.nightHint}
          value={audio.night}
          onChange={(night) => setAudio({ night })}
        />
      </Group>

      <Group title={t.diary.title} hint={t.diary.hint}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]">
          <div className="text-sm font-medium">{t.diary.keepFor}</div>
          <div className="flex gap-1 rounded-[var(--radius-control)] border border-border p-1">
            {[
              { days: 30, label: t.diary.days30 },
              { days: 180, label: t.diary.days180 },
              { days: 365, label: t.diary.days365 },
              { days: 0, label: t.diary.forever },
            ].map(({ days, label }) => (
              <button
                key={days}
                onClick={() => {
                  setNit({ diaryDays: days });
                  // Applied now rather than at the next launch: shortening the
                  // window is a request to forget, and "it will forget later"
                  // is not what that switch says.
                  void diaryPrune(days);
                }}
                className={cn(
                  "rounded-[var(--radius-control)] px-2.5 py-1 text-sm transition-colors duration-[var(--motion-fast)]",
                  nit.diaryDays === days
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Group>
    </div>
  );
}

/* The two building blocks below are local copies of `SettingsView`'s `Group`
   and `Row`, which are private to that file. Duplicated rather than exported:
   they are four lines of layout each, and widening their API to serve a second
   page is how a "shared component" ends up with a `variant` prop. */

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
    <section className="stack">
      <div className="px-1">
        <h2 className="group-title">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <div className="panel divide-y divide-border">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
