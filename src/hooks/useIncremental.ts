import { useEffect, useRef, useState } from "react";

/**
 * Render a long list a chunk at a time.
 *
 * A likes list runs to thousands of rows; mounting them all is what makes the
 * window stutter. This renders the first chunk and appends more as a sentinel
 * near the bottom scrolls into view, so the cost is proportional to what the
 * user has actually looked at.
 */
export function useIncremental<T>(items: T[], chunk = 60) {
  const [count, setCount] = useState(chunk);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new list (filter changed, section switched) starts from the top again.
  useEffect(() => setCount(chunk), [items, chunk]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || count >= items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(items.length, c + chunk));
        }
      },
      // Start loading before the sentinel is actually on screen.
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, items.length, chunk]);

  return {
    visible: items.slice(0, count),
    sentinel,
    hasMore: count < items.length,
    remaining: items.length - count,
  };
}
