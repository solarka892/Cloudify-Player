import { explain } from "@/lib/errorText";
import { asFailure } from "@/lib/failure";
import { toast } from "@/stores/useToastStore";

/**
 * Report a failure to the user, in their language.
 *
 * Replaces `toast(String(e), "error")`, which put `403 Forbidden` in front of
 * somebody who wanted to hear a song — the exact complaint task 17 is about.
 * Everything it needs is already decided elsewhere: Rust names the kind
 * (`bridge.rs`), `errorText` turns that into a sentence, a hint and a
 * diagnostic, and the toast shows the first two with the third behind a toggle.
 *
 * Silent kinds produce nothing at all. A sign-in window the user closed on
 * purpose is not news, and an app that reports its own housekeeping teaches
 * people to dismiss its messages without reading them.
 */
export function toastFailure(e: unknown): void {
  const explained = explain(asFailure(e));
  if (explained.silent) return;
  toast(explained.what, "error", {
    hint: explained.why ?? undefined,
    details: explained.details,
  });
}
