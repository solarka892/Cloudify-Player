import { useEffect } from "react";
import { useAuthStore, type Session } from "@/stores/useAuthStore";

/**
 * How long to wait before asking again while offline.
 *
 * The `online` event is the real signal and this is the safety net under it.
 * Twenty seconds because a retry costs one request that fails fast when there is
 * no route, and because a user who has just reconnected should not have to work
 * out that the app wants a nudge.
 */
const OFFLINE_RETRY_MS = 20_000;

/**
 * Keep the session current: ask once on mount, then again whenever the network
 * comes back.
 *
 * The recovery half is the point. Without it "offline" is a dead end the user
 * escapes by restarting the app — which is the same insult as being signed out,
 * only slower. Two triggers, because neither alone is enough:
 *
 *   - the `online` event, which is immediate and correct when it fires;
 *   - a slow poll, because `navigator.onLine` inside a webview reports the
 *     *interface* rather than the route. A machine on a wifi network with no
 *     upstream is online by that definition and cannot reach SoundCloud, and no
 *     event is ever dispatched when the upstream returns.
 *
 * The poll only runs while the app is actually offline, so the steady state
 * costs nothing.
 */
export function useSession(): Session {
  const session = useAuthStore((s) => s.session);
  const refresh = useAuthStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onOnline() {
      void refresh();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  useEffect(() => {
    if (session.state !== "offline") return;
    const timer = setInterval(() => void refresh(), OFFLINE_RETRY_MS);
    return () => clearInterval(timer);
  }, [session.state, refresh]);

  return session;
}
