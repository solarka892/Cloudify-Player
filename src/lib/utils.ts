import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resize a SoundCloud artwork/avatar URL. The API hands out `-large` (100px);
 * every other size is the same URL with the suffix swapped.
 */
export function artwork(
  url: string | null,
  size: "t50x50" | "t120x120" | "t300x300" | "t500x500" = "t120x120",
): string | null {
  return url ? url.replace("-large", `-${size}`) : null;
}
