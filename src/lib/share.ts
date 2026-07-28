import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";

/**
 * Put a soundcloud.com link on the clipboard.
 *
 * Sharing means handing someone the public page, so the permalink is the whole
 * payload — there is nothing about a local player worth sending.
 */
export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast(t.track.shareCopied, "success");
  } catch {
    // The async clipboard needs a permission the webview may not grant, and
    // there is nowhere to ask for it. The old command still works there.
    const copied = writeWithSelection(url);
    toast(copied ? t.track.shareCopied : t.track.shareFailed, copied ? "success" : "error");
  }
}

/** Pre-clipboard-API fallback: select text in a throwaway node and copy it. */
function writeWithSelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  // Off-screen rather than hidden: `display: none` cannot hold a selection.
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
