/**
 * Which band of the relief ramp a row gets.
 *
 * The ramp means a quantity — that is rule 3 of the language — so a band has to
 * encode something true about the row rather than decorate it. The quantity is
 * **length**, for one reason that decided it: it is the only measure the app has
 * for every track it will ever show. Play counts are not in the payload, marks
 * exist on a handful of rows, and a ramp that is blank on nine rows out of ten
 * declares nothing.
 *
 * Length also happens to be the thing a list of forty tracks hides worst. "Which
 * of these is the nine-minute one" is a question people actually have, and the
 * answer was previously a column of small grey figures to be read one at a time.
 *
 * The boundaries are minutes, not quantiles: a band has to mean the same thing on
 * every screen, and a quantile band would mean "long for this playlist", which is
 * a different fact wearing the same colour.
 */

/** Minutes at which each band starts. Five bands, low ground to high. */
const MINUTES = [0, 2, 4, 6, 9];

/** `1`–`5`, low to high. */
export type Band = 1 | 2 | 3 | 4 | 5;

export function bandForDuration(ms: number): Band {
  const minutes = ms / 60_000;
  let band: Band = 1;
  for (let i = MINUTES.length - 1; i >= 0; i -= 1) {
    if (minutes >= MINUTES[i]!) {
      band = (i + 1) as Band;
      break;
    }
  }
  return band;
}
