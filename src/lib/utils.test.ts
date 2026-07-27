import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditionals", () => {
    // Via a variable, not a literal: a literal `false &&` is dead code eslint
    // rightly rejects, but the falsy-argument behaviour is what we're testing.
    const enabled: boolean = false;
    expect(cn("a", enabled && "b", "c")).toBe("a c");
  });
});
