import { useEffect, useState } from "react";
import {
  scGetMe,
  scLogin,
  scLoginBrowser,
  scSetToken,
  syncInsets,
} from "@/lib/tauri";
import { useSession } from "@/hooks/useSession";
import {
  hasSession,
  sessionUser,
  useAuthStore,
  type Session,
} from "@/stores/useAuthStore";
import { isAndroid } from "@/lib/platform";
import { useNativeMediaSession } from "@/hooks/useNativeMediaSession";
import { Sheet } from "@/features/sheet/Sheet";
import { Toaster } from "@/components/Toaster";
import { NoNetworkNotice } from "@/components/NoNetworkNotice";
import { FailureNotice } from "@/components/FailureNotice";
import { ConfirmHost } from "@/components/ConfirmHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LogoMark } from "@/components/Logo";
import { HotkeyHelp } from "@/components/HotkeyHelp";
import { CommandPalette } from "@/features/nit/CommandPalette";
import { NitView } from "@/features/nit/NitView";
import { useNitSession } from "@/features/nit/useNitSession";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useArtwork } from "@/hooks/useArtwork";
import { useBackGesture } from "@/hooks/useBackGesture";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { HomeView } from "@/features/home/HomeView";
import { LibraryView } from "@/features/library/LibraryView";
import { SearchView } from "@/features/search/SearchView";
import { ProfileView } from "@/features/profile/ProfileView";
import { SettingsView } from "@/features/settings/SettingsView";
import { DetailView } from "@/features/detail/DetailView";
import { MessagesView } from "@/features/messages/MessagesView";
import { NotificationsView } from "@/features/notifications/NotificationsView";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRepostStore } from "@/stores/useRepostStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { t } from "@/i18n";

function App() {
  // Asks Rust where we stand on mount, and again whenever the network returns.
  // The states themselves, and why losing the network is not one of them that
  // signs anybody out, are in `stores/useAuthStore`.
  const session = useSession();
  const beginLogin = useAuthStore((s) => s.beginLogin);
  const signedIn = useAuthStore((s) => s.signedIn);
  const loginFailed = useAuthStore((s) => s.loginFailed);
  const signOut = useAuthStore((s) => s.signOut);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  // Navigation lives in the store now: notifications, profiles and pasted
  // links all move the app around, not just the nav bar.
  const view = useNavStore((s) => s.view);
  const setView = useNavStore((s) => s.setView);
  const detail = useNavStore((s) => s.detail);
  const nowPlaying = useNavStore((s) => s.nowPlaying);
  const setNowPlaying = useNavStore((s) => s.setNowPlaying);
  const requestSearchFocus = useNavStore((s) => s.requestSearchFocus);
  const loadDownloads = useDownloadsStore((s) => s.load);
  const current = usePlayerStore((s) => s.current);

  // On Android this is what keeps audio playing with the screen off; a no-op
  // everywhere else. Mounted above the auth gate so a session restored on launch
  // does not need a second render to be announced.
  useNativeMediaSession();

  // The Android back gesture, the mouse's back button, Alt+← and a swipe from
  // the left edge — all of them, and above the auth gate so the sign-in screen
  // is not the one place they stop working.
  useBackGesture();

  // The offline library gates the download buttons and the playback source,
  // so it has to be known before the first play.
  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);

  // Window title follows the music, the way a media player should.
  useEffect(() => {
    document.title = current
      ? `${current.title}${current.artist ? ` — ${current.artist}` : ""}`
      : "cloudify";
  }, [current]);

  // Cmd-K / Ctrl-K. Not in `useHotkeys`: everything there is a bare key that
  // stands down while a field has focus, and this one has to open *from* a
  // field — a palette you cannot reach from the search box is half a palette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useHotkeys({
    toggleHelp: () => setShowHelp((v) => !v),
    focusSearch: () => {
      setView("search");
      requestSearchFocus();
    },
    toggleFullscreen: () => {
      if (usePlayerStore.getState().current) setNowPlaying(!nowPlaying);
    },
    closeOverlays: () => {
      setShowHelp(false);
      setShowPalette(false);
      setNowPlaying(false);
    },
  });

  // Feed the playing cover to the theme engine: it drives the artwork
  // backdrop and, when enabled, the accent colour.
  //
  // The offline copy when there is one — this is a second full-size request for
  // the same image the player is already showing, and for a downloaded track
  // there is no reason for it to leave the machine.
  const currentArt = useArtwork(current, "t500x500");
  const setArtwork = useSettingsStore((s) => s.setArtwork);
  const locale = useSettingsStore((s) => s.locale);
  useEffect(() => {
    // 500px, not a thumbnail: this is stretched across the whole window, and
    // the blur is a user setting — turn it down and a 120px source is a mess of
    // squares. The accent sampler downscales to 24px regardless.
    void setArtwork(currentArt);
  }, [currentArt, setArtwork]);

  // The host cannot publish its safe-area insets until a document exists to
  // receive them, so the document asks. No-op off Android; see `syncInsets`.
  useEffect(() => {
    void syncInsets();
  }, []);

  if (session.state === "unknown") {
    // A blank sheet, not a spinner: nothing in this language spins, and the
    // answer arrives in a frame or two.
    return <div className="h-full w-full bg-sheet" />;
  }

  // `hasSession` rather than `state === "loggedIn"`, and that is the whole fix
  // for task 23: offline with a remembered user is a session. There is a token
  // in the keyring and a library cached on disk; the only thing missing is
  // SoundCloud, and a sign-in screen would neither say so nor help.
  const me = sessionUser(session);
  if (!hasSession(session) || !me) {
    return (
      <LoginView
        status={session}
        onLogin={async () => {
          beginLogin();
          try {
            if (isAndroid) {
              // A native webview inside the app, since there is no second
              // browser to read a cookie out of — and Rust reports only success,
              // so who we are is a separate question.
              await scLogin();
              signedIn(await scGetMe());
            } else {
              signedIn(await scLoginBrowser());
            }
          } catch (e) {
            loginFailed(e);
          }
        }}
        onAppLogin={
          isAndroid
            ? undefined
            : async () => {
                beginLogin();
                try {
                  // A SoundCloud window we own: Rust reads the token out of that
                  // window's own cookie store, so no browser profile is touched
                  // and the platform stops mattering. It reports success only, so
                  // who signed in is a separate question.
                  await scLogin();
                  signedIn(await scGetMe());
                } catch (e) {
                  loginFailed(e);
                }
              }
        }
        onTokenLogin={async (token) => {
          beginLogin();
          try {
            signedIn(await scSetToken(token));
          } catch (e) {
            loginFailed(e);
          }
        }}
      />
    );
  }
  // Keyed on the language: `t` is a live binding, but memoised subtrees would
  // otherwise keep strings they rendered before the switch. Keying here and not
  // higher up means the session survives a language change.
  return (
    <Sheet key={locale}>
      <SocialSeed userId={me.id} />
      <Toaster />
      {/* Only visible while SoundCloud is unreachable, and it says so instead of
          the app pretending the session ended. */}
      <NoNetworkNotice />
      <ConfirmHost />
      {showHelp && <HotkeyHelp onClose={() => setShowHelp(false)} />}
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {/* The marks, the diary, the resume point and the waveform of whatever is
          playing. Renders nothing. */}
      <NitSession />

      {/* Keyed so a tab change remounts and replays the entry animation. */}
      <div key={detail ? `detail-${detail.kind}-${detail.id}` : view} className="view-enter">
      {/* Inside the keyed wrapper, so navigating away clears a crashed view. */}
      <ErrorBoundary>
      {detail ? (
        <DetailView detail={detail} meId={me.id} />
      ) : (
        <>
          {view === "home" && (
            <HomeView userId={me.id} onNavigate={(next) => setView(next)} />
          )}
          {view === "search" && <SearchView />}
          {view === "library" && <LibraryView userId={me.id} />}
          {view === "nit" && <NitView />}
          {view === "messages" && <MessagesView />}
          {view === "notifications" && <NotificationsView />}
          {view === "profile" && <ProfileView userId={me.id} isSelf />}
          {view === "settings" && (
            <>
              <SettingsView />
              <div className="mt-8 border-t border-border pt-6">
                <button
                  onClick={() => void signOut()}
                  className="text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-destructive"
                >
                  {t.auth.logout} · {me.username}
                </button>
              </div>
            </>
          )}
        </>
      )}
      </ErrorBoundary>
      </div>
    </Sheet>
  );
}

/**
 * Warms the account-wide state the chrome depends on, once per session.
 *
 * Rendered rather than run from an effect up in `App` so it sits below the auth
 * gate — none of this has an answer before we know who is signed in.
 *
 * The inbox and the notifications feed are fetched here rather than lazily by
 * their views, because their whole point in the nav is the unread badge: a
 * count that only appears after you have already visited the tab is not a
 * notification. The reposts feed is what every repost button reads its state
 * from, and it is persisted, so this is a refresh rather than a cold load.
 */
function NitSession() {
  useNitSession();
  return null;
}

function SocialSeed({ userId }: { userId: number }) {
  const loadReposts = useRepostStore((s) => s.load);
  const loadConversations = useMessagesStore((s) => s.load);
  const loadNotifications = useNotificationsStore((s) => s.load);

  useEffect(() => {
    void loadReposts(userId);
    void loadConversations();
    void loadNotifications();
  }, [userId, loadReposts, loadConversations, loadNotifications]);

  return null;
}

/**
 * Pre-auth screen. One primary path and, on the desktop, two fallbacks.
 *
 * The order is deliberate and is the answer to task 3. Signing in through the
 * real browser stays first because it is the one that asks least of the user —
 * they are probably already signed in there. But it only works where this build
 * can read the browser's cookies, which is the Firefox family plus Safari with
 * Full Disk Access; a Chromium default browser (the common case on macOS) leaves
 * it with nothing to read, which is what "sign-in does not work on macOS" was.
 *
 * `onAppLogin` is the route with no browser in it at all: a SoundCloud window
 * inside cloudify, whose cookies belong to us. It was written, it works, and
 * until now nothing on the desktop reached it — the button existed only on
 * Android. A captcha may appear in it; answering one is a thing a person can do,
 * unlike finding a token in devtools.
 */
function LoginView({
  status,
  onLogin,
  onAppLogin,
  onTokenLogin,
}: {
  status: Session;
  onLogin: () => void;
  /** Sign in in a window we own. Absent on Android, where it is `onLogin`. */
  onAppLogin?: () => void;
  onTokenLogin: (token: string) => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const busy = status.state === "loggingIn";

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-8 text-foreground">
      <div className="panel panel-raised relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-[var(--radius-hero)] p-8">
        <div className="flex flex-col items-center gap-2">
          <LogoMark className="h-16 w-24" />
          <h1
            className="brand-text text-4xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            cloudify
          </h1>
          <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
        </div>

        <button
          onClick={onLogin}
          disabled={busy}
          className="brand-gradient w-full rounded-[var(--radius-control)] px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? isAndroid
              ? t.auth.loggingInApp
              : t.auth.loggingIn
            : t.auth.login}
        </button>

        {onAppLogin && (
          <div className="flex w-full flex-col items-center gap-1">
            <button
              onClick={onAppLogin}
              disabled={busy}
              className="w-full rounded-[var(--radius-control)] border border-border bg-secondary px-5 py-2 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-50"
            >
              {t.auth.loginInApp}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              {t.auth.loginInAppHint}
            </p>
          </div>
        )}

        <button
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {t.auth.manualToggle}
        </button>

        {showManual && (
          <form
            className="flex w-full flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim()) onTokenLogin(token.trim());
            }}
          >
            <p className="text-center text-xs text-muted-foreground">
              {t.auth.manualHint}
            </p>
            <input
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              placeholder={t.auth.manualPlaceholder}
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="rounded-[var(--radius-control)] border border-border bg-secondary px-4 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-50"
            >
              {busy ? t.auth.manualChecking : t.auth.manualSubmit}
            </button>
          </form>
        )}

        {status.state === "expired" && (
          <p className="text-center text-sm text-muted-foreground">
            {t.auth.sessionExpired}
          </p>
        )}

        {/* The sign-in screen is the one place a failure is certain to be read,
            so it gets the full explanation rather than the diagnostic it used to
            print. `cancelled` — the user closing the window themselves — is
            silent, and `FailureNotice` knows that. */}
        {status.state === "error" && <FailureNotice error={status.failure} />}

        {/* Reachable when there is a token but no user was ever remembered — a
            first launch that never got through. Says what is wrong rather than
            leaving the sign-in button looking broken. */}
        {status.state === "offline" && (
          <p className="text-center text-sm text-muted-foreground">
            {t.auth.offline}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
