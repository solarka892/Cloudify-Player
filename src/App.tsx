import { useCallback, useEffect, useState } from "react";
import {
  scGetMe,
  scIsLoggedIn,
  scLogin,
  scLoginBrowser,
  scLogout,
  scSetToken,
  syncInsets,
  type Me,
} from "@/lib/tauri";
import { isAndroid } from "@/lib/platform";
import { useNativeMediaSession } from "@/hooks/useNativeMediaSession";
import { AppShell } from "@/components/shell/AppShell";
import { TitleBar } from "@/components/shell/TitleBar";
import { AppleShell } from "@/features/apple/AppleShell";
import { ApplePlayerBar } from "@/features/apple/ApplePlayerBar";
import { Toaster } from "@/components/Toaster";
import { ConfirmHost } from "@/components/ConfirmHost";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SkinLight } from "@/components/Ambient";
import { LogoMark } from "@/components/Logo";
import { HotkeyHelp } from "@/components/HotkeyHelp";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { HomeView } from "@/features/home/HomeView";
import { LibraryView } from "@/features/library/LibraryView";
import { SearchView } from "@/features/search/SearchView";
import { ProfileView } from "@/features/profile/ProfileView";
import { SettingsView } from "@/features/settings/SettingsView";
import { DetailView } from "@/features/detail/DetailView";
import { MessagesView } from "@/features/messages/MessagesView";
import { NotificationsView } from "@/features/notifications/NotificationsView";
import { PlayerBar } from "@/features/player/PlayerBar";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useRepostStore } from "@/stores/useRepostStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { artwork } from "@/lib/utils";
import { t } from "@/i18n";

type AuthStatus =
  | { state: "unknown" }
  | { state: "loggedOut" }
  /** Had a session; SoundCloud rejected it. Needs a fresh sign-in. */
  | { state: "expired" }
  | { state: "loggingIn" }
  | { state: "loggedIn"; me: Me }
  | { state: "error"; message: string };

function App() {
  const [auth, setAuth] = useState<AuthStatus>({ state: "unknown" });
  const [showHelp, setShowHelp] = useState(false);
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
      setNowPlaying(false);
    },
  });

  // Feed the playing cover to the theme engine: it drives the artwork
  // backdrop and, when enabled, the accent colour.
  const currentArt = usePlayerStore((s) => s.current?.artwork_url ?? null);
  const setArtwork = useSettingsStore((s) => s.setArtwork);
  const locale = useSettingsStore((s) => s.locale);
  // Apple mode replaces the frame and the player outright, not just their
  // styling: floating chrome with the content behind it is a different tree,
  // not a restyled one. Everything inside `children` is shared.
  const apple = useSettingsStore((s) => s.theme.apple);
  useEffect(() => {
    // 500px, not a thumbnail: this is stretched across the whole window, and
    // the blur is a user setting — turn it down and a 120px source is a mess of
    // squares. The accent sampler downscales to 24px regardless.
    void setArtwork(artwork(currentArt, "t500x500"));
  }, [currentArt, setArtwork]);

  const refreshMe = useCallback(async () => {
    try {
      if (!(await scIsLoggedIn())) {
        setAuth({ state: "loggedOut" });
        return;
      }
      setAuth({ state: "loggedIn", me: await scGetMe() });
    } catch (e) {
      // Rust clears a token SoundCloud has permanently rejected and reports
      // this marker; that is the signed-out state, not a failure to explain.
      if (String(e).includes("session-expired")) {
        setAuth({ state: "expired" });
        return;
      }
      setAuth({ state: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  // The host cannot publish its safe-area insets until a document exists to
  // receive them, so the document asks. No-op off Android; see `syncInsets`.
  useEffect(() => {
    void syncInsets();
  }, []);

  if (auth.state === "unknown") {
    return <Chrome><div className="h-full w-full bg-background" /></Chrome>;
  }

  if (auth.state !== "loggedIn") {
    return (
      <Chrome>
      <LoginView
        status={auth}
        onLogin={async () => {
          setAuth({ state: "loggingIn" });
          try {
            if (isAndroid) {
              // A native webview inside the app, since there is no second
              // browser to read a cookie out of — and Rust reports only success,
              // so who we are is a separate question.
              await scLogin();
              setAuth({ state: "loggedIn", me: await scGetMe() });
            } else {
              setAuth({ state: "loggedIn", me: await scLoginBrowser() });
            }
          } catch (e) {
            setAuth({ state: "error", message: String(e) });
          }
        }}
        onTokenLogin={async (token) => {
          setAuth({ state: "loggingIn" });
          try {
            setAuth({ state: "loggedIn", me: await scSetToken(token) });
          } catch (e) {
            setAuth({ state: "error", message: String(e) });
          }
        }}
      />
      </Chrome>
    );
  }

  const { me } = auth;
  const Shell = apple ? AppleShell : AppShell;

  return (
    <Chrome>
    {/* Keyed on the language: `t` is a live binding, but memoised subtrees would
        otherwise keep strings they rendered before the switch. Keying here and
        not higher up means the session survives a language change. */}
    <Shell
      key={locale}
      view={view}
      onNavigate={setView}
      player={apple ? <ApplePlayerBar /> : <PlayerBar />}
    >
      <SocialSeed userId={me.id} />
      <Toaster />
      <ConfirmHost />
      {showHelp && <HotkeyHelp onClose={() => setShowHelp(false)} />}

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
          {view === "messages" && <MessagesView />}
          {view === "notifications" && <NotificationsView />}
          {view === "profile" && <ProfileView userId={me.id} isSelf />}
          {view === "settings" && (
            <>
              <SettingsView />
              <div className="mt-8 border-t border-border pt-6">
                <button
                  onClick={async () => {
                    await scLogout();
                    setAuth({ state: "loggedOut" });
                  }}
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
    </Shell>
    </Chrome>
  );
}

/**
 * The window, around whatever the app is currently showing.
 *
 * Wraps all three of `App`'s branches, including the pre-auth screen and the
 * blank frame shown while the session is being checked: the window launches
 * undecorated, so a title bar that only appeared once signed in would leave no
 * way to close the app before signing in.
 *
 * A flex column rather than the title bar floating over the content, because the
 * bar takes real height from the shells below it — both of them are `h-full`, and
 * a fixed bar would have put 32px of the interface underneath itself.
 *
 * `.app-frame` is the window's outer hairline. Without system decorations there
 * is no frame and, on Linux and Windows, no drop shadow either, so on a dark
 * desktop the app would have no visible edge at all. Only the skins that ask for
 * it draw one — see `globals.css`.
 */
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame relative flex h-full w-full flex-col overflow-hidden">
      <TitleBar />
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
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

/** Pre-auth screen. Deliberately quiet: one primary path, one fallback. */
function LoginView({
  status,
  onLogin,
  onTokenLogin,
}: {
  status: AuthStatus;
  onLogin: () => void;
  onTokenLogin: (token: string) => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const busy = status.state === "loggingIn";

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-8 text-foreground">
      {useSettingsStore.getState().backdrop.mode !== "none" && (
        <div className="app-backdrop" aria-hidden />
      )}
      <SkinLight />
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

        {status.state === "error" && (
          <p className="text-center text-sm text-destructive">
            {t.auth.loginFailed}: {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

export default App;
