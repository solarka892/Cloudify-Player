/**
 * Rehydrate by filling saved values *into* the defaults, at every depth.
 *
 * zustand's own merge is shallow, which is a trap for nested settings: a
 * `backdrop` object written before a field existed replaces the current default
 * wholesale, and every field added since reads `undefined`. That is not a
 * missing preference, it is a value that matches none of a union's cases — and
 * it took the whole app down once, when `backdrop.effect` arrived: the ambient
 * layer saw neither `"none"` nor a known effect, looked up a spec that wasn't
 * there, and threw where React had nothing to catch it.
 *
 * Filling into the defaults means a new field is simply itself until the user
 * changes it, which is what adding a setting should cost. Arrays are replaced
 * rather than merged — a saved list is the whole list.
 */
export function fillDefaults<T>(defaults: T, persisted: unknown): T {
  if (
    typeof defaults !== "object" ||
    defaults === null ||
    Array.isArray(defaults) ||
    typeof persisted !== "object" ||
    persisted === null ||
    Array.isArray(persisted)
  ) {
    return (persisted === undefined ? defaults : persisted) as T;
  }

  const saved = persisted as Record<string, unknown>;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
    if (!(key in saved)) continue;
    out[key] = fillDefaults(value, saved[key]);
  }
  return out as T;
}
