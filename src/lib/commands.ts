import { t } from "@/i18n";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * Everything the command palette can run.
 *
 * A registry, not a list inside the palette, and that is the whole design: a new
 * feature adds itself here in one entry and is instantly reachable from the
 * keyboard, instead of someone remembering to edit a component that lives
 * somewhere else. The palette does not know what any of these do.
 *
 * Built fresh on each call rather than as a module constant, for two reasons —
 * `t` is a live binding, so a table built at import time freezes the language it
 * was imported in, and half of these have labels that depend on current state
 * ("Pause" or "Play").
 */

export interface Command {
  /** Stable and unique; the tests check the second part. */
  id: string;
  group: "commands" | "views";
  label: string;
  /** Extra words that should find this command, space separated. */
  keywords?: string;
  run: () => void;
}

export function buildCommands(): Command[] {
  const nav = useNavStore.getState();
  const player = usePlayerStore.getState();
  const settings = useSettingsStore.getState();

  const commands: Command[] = [
    {
      id: "player.toggle",
      group: "commands",
      label: player.isPlaying ? t.player.pause : t.player.play,
      run: () => usePlayerStore.getState().togglePlay(),
    },
    {
      id: "player.next",
      group: "commands",
      label: t.player.next,
      run: () => usePlayerStore.getState().next(),
    },
    {
      id: "player.prev",
      group: "commands",
      label: t.player.prev,
      run: () => usePlayerStore.getState().prev(),
    },
    {
      id: "player.shuffle",
      group: "commands",
      label: t.player.shuffle,
      run: () => usePlayerStore.getState().toggleShuffle(),
    },
    {
      id: "theme.mode",
      group: "commands",
      label: settings.theme.mode === "dark" ? t.settings.themeLight : t.settings.themeDark,
      keywords: "theme dark light тема",
      run: () =>
        useSettingsStore
          .getState()
          .setTheme({ mode: settings.theme.mode === "dark" ? "light" : "dark" }),
    },
  ];

  // Every top-level place, without repeating the nav list: whatever the app's
  // sections are, they are all reachable from here by definition.
  const views: Command[] = [
    { id: "view.home", label: t.nav.home },
    { id: "view.search", label: t.nav.search },
    { id: "view.library", label: t.nav.library },
    { id: "view.nit", label: t.marks.title },
    { id: "view.messages", label: t.nav.messages },
    { id: "view.notifications", label: t.nav.notifications },
    { id: "view.profile", label: t.nav.profile },
    { id: "view.settings", label: t.nav.settings },
  ].map(({ id, label }) => ({
    id,
    group: "views" as const,
    label,
    run: () => nav.setView(id.slice("view.".length) as never),
  }));

  return [...commands, ...views];
}

/**
 * Does this command answer to what was typed?
 *
 * Deliberately dumber than the track search, which goes through SQLite and the
 * transliteration table: command labels are already in the interface language
 * the user picked, so a case-insensitive substring over the label and its
 * keywords is the whole requirement.
 */
export function commandMatches(command: Command, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return (
    command.label.toLowerCase().includes(needle) ||
    (command.keywords?.toLowerCase().includes(needle) ?? false)
  );
}
