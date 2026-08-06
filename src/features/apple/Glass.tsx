import { cn } from "@/lib/utils";

/**
 * A Liquid Glass surface.
 *
 * The material itself is in `styles/apple.css` under `.lg` — a backdrop pass,
 * a rim, a specular pair and a trace of dispersion. This component exists for
 * one reason beyond naming: the refractive ring needs a real element, because
 * `::before` and `::after` are already spent on the highlight and the
 * dispersion. That ring is progressive enhancement (it needs
 * `mask-composite`), so the span is inert wherever the engine cannot paint it.
 *
 * `chrome` is for a floating bar that carries controls over moving content —
 * more body, so a transport stays legible while artwork scrolls behind it.
 * `capsule` is the dock geometry: fully rounded-[var(--radius-control)] rather than a 28pt card.
 */
export function Glass({
  chrome = false,
  capsule = false,
  className,
  children,
  ...rest
}: React.ComponentProps<"div"> & {
  chrome?: boolean;
  capsule?: boolean;
}) {
  return (
    <div
      className={cn(
        "lg",
        chrome && "lg-chrome",
        capsule && "lg-capsule",
        className,
      )}
      {...rest}
    >
      <span className="lg-lens" aria-hidden />
      {children}
    </div>
  );
}
