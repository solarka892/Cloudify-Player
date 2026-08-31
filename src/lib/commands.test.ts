import { describe, expect, it } from "vitest";
import { buildCommands, commandMatches, type Command } from "./commands";

/**
 * The registry, checked where it is cheapest to break.
 *
 * The palette renders these by id and keys its list on them, so a duplicate id
 * is not a cosmetic problem: React drops the second row, and the command
 * quietly stops existing. Nothing else in the app would notice.
 */
describe("the command registry", () => {
  it("has no duplicate ids", () => {
    const ids = buildCommands().map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every command something to show and something to run", () => {
    for (const command of buildCommands()) {
      expect(command.label, command.id).toBeTruthy();
      expect(typeof command.run, command.id).toBe("function");
    }
  });

  it("reaches every top-level view", () => {
    // The palette is meant to be a complete way around the app. A section that
    // is only reachable by clicking is a section the keyboard cannot get to.
    const views = buildCommands().filter((c) => c.group === "views");
    expect(views.length).toBeGreaterThanOrEqual(8);
  });
});

describe("matching what was typed", () => {
  it("ignores case and matches part of a label", () => {
    const command = buildCommands()[0]!;
    expect(commandMatches(command, command.label.slice(1, 4).toUpperCase())).toBe(
      true,
    );
  });

  it("matches nothing typed against everything", () => {
    expect(commandMatches(buildCommands()[0]!, "")).toBe(true);
  });

  /**
   * The matcher, against a command written here rather than fished out of the
   * catalogue.
   *
   * It used to reach for `marks.add`, which had keywords, and went down with it
   * when marks were removed — a test of "can a command be found by a word it
   * does not say" has no business depending on which commands exist.
   */
  it("matches on keywords a label does not contain", () => {
    const command: Command = {
      id: "test",
      group: "commands",
      label: "Toggle theme",
      keywords: "тема",
      run: () => {},
    };
    expect(commandMatches(command, "тема")).toBe(true);
    expect(commandMatches(command, "theme")).toBe(true);
  });
});
