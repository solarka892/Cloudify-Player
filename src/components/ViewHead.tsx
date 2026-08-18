import { cn } from "@/lib/utils";

/**
 * The top of a screen: what it is, one line of numbers about it, and whatever
 * acts on the whole of it — usually a search field, on the same baseline.
 *
 * A component rather than a pattern each view repeats, because the head is
 * where a look is most recognisable and it was previously written out by hand
 * in eight places, each slightly differently. One element means the skin can
 * restyle every screen at once: Nit gives it a hairline underneath, an
 * uppercase 800-weight title with a second impression out of register, and the
 * stats line in the instrument face.
 *
 * Neutral by itself. Under the other three skins this is a heading, a muted
 * line and a gap, which is what they had.
 */
export function ViewHead({
  title,
  sub,
  actions,
  className,
}: {
  title: string;
  /** One line of readings: counts, totals, when it last synced. */
  sub?: React.ReactNode;
  /** Search, filters — anything that acts on the whole screen. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      // The window is dragged by the empty space beside a screen's title, now
      // that there is no title bar to drag it by. Tauri only starts a drag when
      // the *target* carries this attribute, so a click on the heading text or
      // in the field beside it is still a click.
      data-tauri-drag-region
      className={cn(
        // More air above and below than anything else on the page gets. A page
        // title set tight against the first row of content reads as the first
        // row of content; the space is what makes it a heading.
        "view-head flex flex-wrap items-end justify-between gap-4 pb-2 pt-1",
        className,
      )}
    >
      <div className="min-w-0">
        {/* Display size, not title size. Every screen in the app opens with one
            of these, and at 22px it was the same rank as the shelf headings
            underneath it — so a page looked like a list of equals with no
            beginning. At 32 it is unmistakably the top of something. */}
        <h1 className="type-display">{title}</h1>
        {/* Tabular figures, but in the interface's own face rather than the
            monospace one. `.readout` is for a *reading* — a clock that reflows
            every second, a column of durations that has to line up. A screen's
            subtitle is a sentence with a number in it, and setting it on a
            typewriter made every page look like a terminal. The tabular
            numerals stay, because that part was never the problem. */}
        {sub && <div className="view-head-sub type-label tabular-nums text-muted-foreground">{sub}</div>}
      </div>
      {actions && <div className="min-w-0 shrink-0">{actions}</div>}
    </header>
  );
}
