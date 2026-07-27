import { create } from "zustand";

/** Transient notices. Nothing here is persisted or worth an error dialog. */

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast["tone"]) => void;
  dismiss: (id: number) => void;
}

/** How long a toast stays up before it removes itself. */
const TTL_MS = 3200;
let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push(message, tone = "info") {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    setTimeout(() => get().dismiss(id), TTL_MS);
  },

  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

/** Convenience for non-React callers (stores, event handlers). */
export const toast = (message: string, tone?: Toast["tone"]) =>
  useToastStore.getState().push(message, tone);
