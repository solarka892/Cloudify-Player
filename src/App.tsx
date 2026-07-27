import { useCallback, useEffect, useState } from "react";
import {
  scGetMe,
  scIsLoggedIn,
  scLoginBrowser,
  scLogout,
  scSetToken,
  type Me,
} from "@/lib/tauri";
import { AppShell } from "@/components/shell/AppShell";
import type { ViewId } from "@/components/shell/nav";
import { HomeView } from "@/features/home/HomeView";
import { LibraryView } from "@/features/library/LibraryView";
import { SearchView } from "@/features/search/SearchView";
import { ProfileView } from "@/features/profile/ProfileView";
import { SettingsView } from "@/features/settings/SettingsView";
import { DetailView } from "@/features/detail/DetailView";
import { PlayerBar } from "@/features/player/PlayerBar";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { artwork } from "@/lib/utils";
import { t } from "@/i18n";

type AuthStatus =
  | { state: "unknown" }
  | { state: "loggedOut" }
  | { state: "loggingIn" }
  | { state: "loggedIn"; me: Me }
  | { state: "error"; message: string };

function App() {
  const [auth, setAuth] = useState<AuthStatus>({ state: "unknown" });
  const [view, setView] = useState<ViewId>("home");
  const detail = useNavStore((s) => s.detail);
  const closeDetail = useNavStore((s) => s.back);

  // Feed the playing cover to the theme engine: it drives the artwork
  // backdrop and, when enabled, the accent colour.
  const currentArt = usePlayerStore((s) => s.current?.artwork_url ?? null);
  const setArtwork = useSettingsStore((s) => s.setArtwork);
  useEffect(() => {
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
      setAuth({ state: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  if (auth.state === "unknown") {
    return <div className="h-full w-full bg-background" />;
  }

  if (auth.state !== "loggedIn") {
    return (
      <LoginView
        status={auth}
        onBrowserLogin={async () => {
          setAuth({ state: "loggingIn" });
          try {
            setAuth({ state: "loggedIn", me: await scLoginBrowser() });
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
    );
  }

  const { me } = auth;

  return (
    <AppShell
      view={view}
      onNavigate={(next) => {
        closeDetail(); // leaving a tab abandons whatever was drilled into
        setView(next);
      }}
      player={<PlayerBar />}
    >
      {detail ? (
        <DetailView detail={detail} />
      ) : (
        <>
          {view === "home" && (
            <HomeView userId={me.id} onNavigate={(next) => setView(next)} />
          )}
          {view === "search" && <SearchView />}
          {view === "library" && <LibraryView userId={me.id} />}
          {view === "profile" && <ProfileView me={me} />}
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
    </AppShell>
  );
}

/** Pre-auth screen. Deliberately quiet: one primary path, one fallback. */
function LoginView({
  status,
  onBrowserLogin,
  onTokenLogin,
}: {
  status: AuthStatus;
  onBrowserLogin: () => void;
  onTokenLogin: (token: string) => void;
}) {
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const busy = status.state === "loggingIn";

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-8 text-foreground">
      <div className="app-backdrop" aria-hidden />
      <div className="panel panel-raised relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-[var(--radius-hero)] p-8">
        <div className="flex flex-col items-center gap-2">
          <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-[var(--radius)] text-3xl font-black text-white">
            c
          </span>
          <h1
            className="brand-text text-4xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            cloudify
          </h1>
          <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
        </div>

        <button
          onClick={onBrowserLogin}
          disabled={busy}
          className="brand-gradient w-full rounded-[var(--radius-control)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t.auth.loggingIn : t.auth.login}
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
