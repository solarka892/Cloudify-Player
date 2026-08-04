import { create } from "zustand";

/**
 * In-app confirmation, in place of `window.confirm`.
 *
 * Android's WebView only shows a JS dialog if the host has installed a
 * `WebChromeClient` that implements `onJsConfirm`; without one the call returns
 * `false` and nothing appears. So on a phone "delete this conversation" was a
 * button that silently did nothing — the worst possible outcome for the two
 * places this is used, both of which destroy something.
 *
 * Promise-based so a call site reads the same as the built-in it replaces:
 *
 * ```ts
 * if (!(await confirmAction(t.messages.deleteConfirm))) return;
 * ```
 */

interface Pending {
  message: string;
  /** Styles the button and names the action. */
  confirmLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

interface ConfirmState {
  pending: Pending | null;
  answer: (ok: boolean) => void;
  ask: (pending: Omit<Pending, "resolve">) => Promise<boolean>;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,

  answer(ok) {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null });
    pending.resolve(ok);
  },

  ask(request) {
    // A second question while one is open answers the first with "no": two
    // stacked confirmations is never what anyone wanted, and cancelling is the
    // safe reading of an interrupted destructive action.
    get().answer(false);
    return new Promise<boolean>((resolve) => {
      set({ pending: { ...request, resolve } });
    });
  },
}));

/** Ask, and resolve with what the user chose. */
export function confirmAction(
  message: string,
  options: { confirmLabel: string; destructive?: boolean },
): Promise<boolean> {
  return useConfirmStore.getState().ask({
    message,
    confirmLabel: options.confirmLabel,
    destructive: options.destructive ?? true,
  });
}
