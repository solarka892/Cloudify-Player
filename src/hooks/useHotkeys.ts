import { useEffect } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";

/**
 * Global keyboard shortcuts.
 *
 * Every binding is a single key so nothing collides with the OS, and the whole
 * thing stands down while the user is typing — a shortcut that eats characters
 * in a search box is worse than no shortcut.
 */

const SEEK_STEP_S = 5;
const VOLUME_STEP = 0.05;

/** ↑ ↑ ↓ ↓ ← → ← → B A */
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export interface HotkeyActions {
  toggleHelp: () => void;
  focusSearch: () => void;
  toggleFullscreen: () => void;
  closeOverlays: () => void;
}

export function useHotkeys(actions: HotkeyActions): void {
  useEffect(() => {
    let progress = 0;

    function onKeyDown(e: KeyboardEvent) {
      // Konami runs even while typing is not in progress; it uses arrows too,
      // so it is checked before the seek/volume bindings claim them.
      if (!isTyping(e.target)) {
        const expected = KONAMI[progress];
        if (expected && e.key.toLowerCase() === expected.toLowerCase()) {
          progress += 1;
          if (progress === KONAMI.length) {
            progress = 0;
            unlockVapor();
            return;
          }
        } else {
          progress = e.key === KONAMI[0] ? 1 : 0;
        }
      }

      if (e.key === "Escape") {
        actions.closeOverlays();
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      const player = usePlayerStore.getState();

      switch (e.key) {
        case " ":
          e.preventDefault();
          player.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) player.next();
          else player.seek(player.position + SEEK_STEP_S);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) player.prev();
          else player.seek(Math.max(0, player.position - SEEK_STEP_S));
          break;
        case "ArrowUp":
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + VOLUME_STEP));
          break;
        case "ArrowDown":
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - VOLUME_STEP));
          break;
        case "m":
        case "ь":
          player.toggleMute();
          break;
        case "s":
        case "ы":
          player.toggleShuffle();
          break;
        case "r":
        case "к":
          player.cycleRepeat();
          break;
        case "f":
        case "а":
          actions.toggleFullscreen();
          break;
        case "/":
          e.preventDefault();
          actions.focusSearch();
          break;
        case "?":
          actions.toggleHelp();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions]);
}

/** The Konami payoff: a hidden palette, plus a few seconds of nonsense. */
function unlockVapor(): void {
  const settings = useSettingsStore.getState();
  const first = settings.unlock("palette:vapor");
  settings.setTheme({ palette: "vapor" });
  toast(first ? t.eggs.vaporFound : t.eggs.vaporAgain, "success");

  const root = document.documentElement;
  root.dataset.disco = "1";
  setTimeout(() => delete root.dataset.disco, 6000);
}
