import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useNavStore, type ViewId } from "@/stores/useNavStore";

/**
 * The sheet index: where you are on the sheet, and what the other sheets are.
 *
 * A strip along the top margin, because that is where a map carries its index —
 * not a rail down the left side, which is what Spotify, the SoundCloud website
 * and every one of this app's five previous layouts did. The silhouette is the
 * thing you recognise from across a room, and that one was not ours.
 *
 * Words, not icons. An icon set is a second vocabulary to learn and the language
 * has a rule about symbols that the legend cannot name; a sheet index is a list
 * of names. The current sheet is the only one in full ink, underlined in water —
 * "you are here" is what the water is for.
 */

/** The sheets, in the order a listener moves through them. */
const SHEETS: { id: ViewId; label: () => string }[] = [
  { id: "home", label: () => t.nav.home },
  { id: "library", label: () => t.nav.library },
  { id: "search", label: () => t.nav.search },
  { id: "messages", label: () => t.nav.messages },
  { id: "notifications", label: () => t.nav.notifications },
  { id: "nit", label: () => t.nav.nit },
  { id: "profile", label: () => t.nav.profile },
  { id: "settings", label: () => t.nav.settings },
];

export function Index() {
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const unreadMessages = useMessagesStore((s) => s.unread);
  const unreadNotifications = useNotificationsStore((s) => s.unreadCount());

  return (
    <nav aria-label={t.nav.feed} className="min-w-0 flex-1">
      <ul className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        {SHEETS.map((sheet) => {
          const here = view === sheet.id;
          // A count is a quantity, so it is set in the instrument face. Only
          // shown when it is not zero: a "0" beside a name is noise that reads
          // as a state.
          const count =
            sheet.id === "messages"
              ? unreadMessages
              : sheet.id === "notifications"
                ? unreadNotifications
                : 0;

          return (
            <li key={sheet.id}>
              <button
                onClick={() => setView(sheet.id)}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "flex items-baseline gap-1.5 border-b-[1.5px] pb-0.5 transition-colors duration-[var(--t-state)]",
                  here
                    ? "border-water text-ink"
                    : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {sheet.label()}
                {count > 0 && (
                  <span className="readout text-water">{count}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
