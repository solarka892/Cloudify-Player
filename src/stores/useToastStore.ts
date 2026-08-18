import { create } from "zustand";

/** Transient notices. Nothing here is persisted or worth an error dialog. */

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  /** One line on what to do about it. Shown under the message. */
  hint?: string;
  /**
   * The English diagnostic, behind a toggle.
   *
   * Kept out of `message` deliberately: a status code is what a bug report needs
   * and the opposite of what somebody who wanted to hear a song needs. See
   * `lib/errorText.ts`.
   */
  details?: string;
}

/** Everything about a toast except the words and the tone. */
export type ToastExtras = Pick<Toast, "hint" | "details">;

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"], extras?: ToastExtras) => void;
  dismiss: (id: number) => void;
}

/**
 * How long a toast stays up before it removes itself.
 *
 * An error with details to read gets longer: 3.2 seconds is enough to notice a
 * confirmation and not enough to open a disclosure and read a status code.
 */
const TTL_MS = 3200;
const TTL_DETAILED_MS = 9000;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push(message, tone = "info", extras) {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone, ...extras }] });
    const ttl = extras?.details ? TTL_DETAILED_MS : TTL_MS;
    setTimeout(() => get().dismiss(id), ttl);
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Convenience for non-React callers (stores, event handlers). */
export const toast = (
  message: string,
  tone?: Toast["tone"],
  extras?: ToastExtras,
) => useToastStore.getState().push(message, tone, extras);
