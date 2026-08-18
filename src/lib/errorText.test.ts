import { describe, expect, it } from "vitest";
import { dictionaries, setLocale } from "@/i18n";
import { explain, remedyLabel } from "./errorText";
import { asFailure } from "./failure";

/**
 * Every failure has to say something a person can read.
 *
 * The list below is the contract between the two halves of task 17: Rust names
 * these kinds (`src-tauri/src/bridge.rs` and `ScApiError::kind`), and this side
 * owes each of them a sentence. A kind added in Rust and forgotten here would
 * silently degrade to "something went wrong" — correct, useless, and invisible
 * in review. Keeping the list here means adding one is a deliberate two-file
 * change rather than an accident.
 */
const KINDS_FROM_RUST = [
  "offline",
  "bad-reply",
  "broken",
  "client-id",
  "no-stream",
  "rejected",
  "rate-limited",
  "session-expired",
  "bot-filtered",
  "refused",
  "not-soundcloud-url",
  "unexpected-host",
  "not-logged-in",
  "unsupported",
  "login-timeout",
  "empty-input",
  "keyring",
  "cancelled",
  "disk",
  "local-library",
  "tagging",
  "not-downloadable",
  "media-session",
] as const;

/** The two that must never reach the user, and why. */
const SILENT = ["cancelled", "media-session"];

/** These four are diagnoses of one situation, and share its sentence. */
const REFUSAL_KINDS = ["refused", "rejected", "bad-reply", "client-id"];

function failure(kind: string) {
  return asFailure({ kind, message: "the diagnostic" });
}

describe("explain", () => {
  it.each(KINDS_FROM_RUST)("says something about %s", (kind) => {
    const explained = explain(failure(kind));
    expect(explained.what.length, kind).toBeGreaterThan(0);
    // The diagnostic survives, and is not the sentence.
    expect(explained.details).toBe("the diagnostic");
    expect(explained.what).not.toContain("the diagnostic");
  });

  it.each(SILENT)("keeps quiet about %s", (kind) => {
    expect(explain(failure(kind)).silent).toBe(true);
  });

  it("does not go quiet on anything else", () => {
    for (const kind of KINDS_FROM_RUST) {
      if (SILENT.includes(kind)) continue;
      expect(explain(failure(kind)).silent, kind).toBe(false);
    }
  });

  it("offers the right thing to do", () => {
    expect(explain(failure("offline")).remedy).toBe("retry");
    expect(explain(failure("rate-limited")).remedy).toBe("retry");
    expect(explain(failure("session-expired")).remedy).toBe("signIn");
    expect(explain(failure("not-logged-in")).remedy).toBe("signIn");
    expect(explain(failure("bot-filtered")).remedy).toBe("openSoundCloud");
    // Nothing to offer is a real answer: a "try again" that cannot help is
    // worse than no button.
    expect(explain(failure("no-stream")).remedy).toBe("none");
    expect(explain(failure("not-downloadable")).remedy).toBe("none");
  });

  it("gives the four refusal kinds one sentence between them", () => {
    const sentences = new Set(REFUSAL_KINDS.map((k) => explain(failure(k)).what));
    expect(sentences.size).toBe(1);
  });

  /**
   * The point of the whole exercise: no status code, no English keyword, in the
   * sentence a reader sees. The diagnostic is the place for those.
   */
  it("never puts a status code in front of the reader", () => {
    for (const kind of KINDS_FROM_RUST) {
      const { what, why } = explain(
        asFailure({ kind, message: "403 Forbidden: request failed" }),
      );
      expect(`${what} ${why ?? ""}`, kind).not.toMatch(/40[0-9]|50[0-9]/);
    }
  });

  it("explains a kind it has never heard of rather than throwing", () => {
    const explained = explain(failure("a-kind-from-a-newer-build"));
    expect(explained.what.length).toBeGreaterThan(0);
    // The diagnostic is what makes this reportable at all.
    expect(explained.details).toBe("the diagnostic");
  });

  it("explains a rejection that never came from Rust", () => {
    const explained = explain(asFailure(new Error("boom")));
    expect(explained.what.length).toBeGreaterThan(0);
    expect(explained.details).toBe("boom");
  });
});

describe("every language", () => {
  const locales = Object.keys(dictionaries) as (keyof typeof dictionaries)[];

  it.each(locales)("has all the error sentences in %s", (locale) => {
    setLocale(locale);
    try {
      for (const kind of KINDS_FROM_RUST) {
        const explained = explain(failure(kind));
        expect(explained.what.trim().length, `${locale}/${kind}`).toBeGreaterThan(0);
      }
      for (const remedy of ["retry", "signIn", "openSoundCloud"] as const) {
        expect(remedyLabel(remedy)?.trim().length, `${locale}/${remedy}`).toBeGreaterThan(0);
      }
    } finally {
      setLocale("en");
    }
  });
});
