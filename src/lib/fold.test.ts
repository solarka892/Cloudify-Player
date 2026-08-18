import { describe, expect, it } from "vitest";
import { fold, matchedByFolding, matches } from "./fold";

/**
 * The table this is judged by — and it is deliberately the *same* table as
 * `cache::fold::tests` in Rust.
 *
 * There are two implementations of this folding, one per language, because one
 * backs the FTS index over the whole library and the other filters a list the
 * screen already holds. They have to agree: the same query finding different
 * things in the library and in the command palette is the kind of bug nobody
 * reports, they just stop trusting the search. If you change one, change both,
 * and this file is what tells you that you did not.
 */
const PAIRS: [string, string][] = [
  ["Вязки", "vyazki"],
  ["вязки", "VYAZKI"],
  ["Чёрный воздух", "chernyy vozduh"],
  ["Чёрный воздух", "chyornyy vozdukh"],
  ["Черный Воздух", "cherny vozduh"],
  ["Цунами", "tsunami"],
  ["Цунами", "Cunami"],
  ["Щука", "schuka"],
  ["Щука", "shchuka"],
  ["Дождь", "dozhd"],
  ["Київ", "kyiv"],
  ["Сонце", "sonce"],
];

describe("folding", () => {
  it("puts both scripts onto the same string", () => {
    for (const [cyrillic, latin] of PAIRS) {
      expect(fold(cyrillic), `${cyrillic} vs ${latin}`).toBe(fold(latin));
    }
  });

  it("is idempotent", () => {
    for (const s of ["Чёрный воздух", "Tsunami [Free DL]", "щука", "Vyazki"]) {
      expect(fold(fold(s))).toBe(fold(s));
    }
  });

  it("strips the decoration SoundCloud titles come with", () => {
    expect(fold("Sunset  Grid (prod. by Someone) [Free DL] ★")).toBe(
      "sunset grid prod by someone free dl",
    );
    expect(fold("  ...Вязки!!!  ")).toBe("vyazki");
  });
});

describe("matching", () => {
  it("finds a Cyrillic title from a Latin keyboard, and the reverse", () => {
    expect(matches("vyazki", "Вязки")).toBe(true);
    expect(matches("Вязки", "Vyazki")).toBe(true);
    expect(matches("chernyy vozduh", "Чёрный воздух")).toBe(true);
  });

  it("does not match everything", () => {
    expect(matches("vyazki", "Sunset Grid")).toBe(false);
  });

  it("matches everything when nothing was typed", () => {
    expect(matches("", "anything at all")).toBe(true);
  });

  it("knows when the folding is what did the work", () => {
    // Only then is it worth saying so on screen.
    expect(matchedByFolding("vyazki", "Вязки")).toBe(true);
    expect(matchedByFolding("sunset", "Sunset Grid")).toBe(false);
    expect(matchedByFolding("nothing", "Sunset Grid")).toBe(false);
  });
});
