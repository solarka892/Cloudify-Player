import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A switch that does not slide.
 *
 * Rule 4 of the language: nothing moves position. A sliding knob is the one
 * animation every interface has and this one cannot — so the control states
 * itself instead of travelling. Off is an empty box with a contour; on is the box
 * filled with the accent and a mark in it.
 *
 * That is closer to what a switch on a printed form looks like than to what a
 * phone switch looks like, which is the right family: this is a sheet.
 *
 * The API is the one the rest of the app already calls — `checked` plus
 * `onCheckedChange` — so no settings row had to be rewritten to use it.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius)] border-[1.5px] transition-colors duration-[var(--t-state)] disabled:opacity-50",
        checked
          ? "border-transparent bg-brand text-brand-foreground"
          : "border-contour bg-transparent hover:bg-accent",
        className,
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
    </button>
  );
}
