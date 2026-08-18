import { useEffect } from "react";
import { useNitStore } from "@/stores/useNitStore";
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
            unlockGraticule();
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
        // M marks, and mute moves up onto Shift.
        //
        // A collision worth being explicit about: `m` was mute, which is the web
        // convention, and marks are the one feature in this app that has to be
        // reachable without looking away from what you are doing. Mute is one
        // modifier away and the volume keys are still ↑↓; a mark on `b` would be
        // a shortcut nobody ever finds. Shown as it is in the help sheet.
        case "m":
        case "ь":
          if (e.shiftKey) {
            player.toggleMute();
            break;
          }
          void markHere();
          break;
        // Jump to the nth mark on this track. Nothing happens when there is no
        // nth mark, rather than jumping to the last one — a silent no-op is
        // better than a seek you did not ask for.
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          const mark = useNitStore.getState().marks[Number(e.key) - 1];
          if (mark) player.seek(mark.position_ms / 1000);
          break;
        }
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

/**
 * Mark the moment that is playing.
 *
 * Exported because two things call it: the `m` key here, and the global
 * shortcut, which fires when this window does not have focus at all — which is
 * the entire point of marks ("ставятся не отрываясь от дела").
 */
export async function markHere(): Promise<void> {
  const player = usePlayerStore.getState();
  const track = player.current;
  if (!track) return;
  const positionMs = player.position * 1000;
  const mark = await useNitStore.getState().addMark(track.id, positionMs);
  if (!mark) {
    toast(t.marks.failed, "error");
    return;
  }
  toast(t.marks.added.replace("{time}", clock(positionMs)), "success");
}

/** m:ss, for a message about a position rather than a duration. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The Konami payoff: the sheet's coordinate grid.
 *
 * It used to unlock a hidden neon palette, which has nowhere to live now that
 * there is one palette — and a language whose rule is "no colour the legend
 * cannot name" cannot have a secret sixth colour as its joke.
 *
 * A graticule is the grid a survey sheet is ruled with, and it is a real part of
 * the artefact rather than a gag about one. Ten keystrokes rule the sheet; ten
 * more clear it. See `--data-graticule` in `globals.css`.
 */
function unlockGraticule(): void {
  const settings = useSettingsStore.getState();
  const first = settings.unlock("sheet:graticule");
  const root = document.documentElement;
  const on = root.dataset.graticule !== "1";
  if (on) root.dataset.graticule = "1";
  else delete root.dataset.graticule;
  toast(first ? t.eggs.graticuleFound : t.eggs.graticuleAgain, "success");
}
