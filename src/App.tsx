import { useCallback, useEffect, useState } from "react";
import {
  getAppVersion,
  getClientId,
  scGetMe,
  scIsLoggedIn,
  scLogin,
  scLogout,
  type Me,
} from "@/lib/tauri";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type BackendStatus =
  | { state: "checking" }
  | { state: "ok"; version: string }
  | { state: "error"; message: string };

type ClientIdStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; masked: string; length: number }
  | { state: "error"; message: string };

type AuthStatus =
  | { state: "unknown" }
  | { state: "loggedOut" }
  | { state: "loggingIn" }
  | { state: "loggedIn"; me: Me }
  | { state: "error"; message: string };

/** Mask a secret-ish value: keep first 4 + last 3 chars. */
function mask(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-3)}`;
}

function App() {
  const [backend, setBackend] = useState<BackendStatus>({ state: "checking" });
  const [clientId, setClientId] = useState<ClientIdStatus>({ state: "idle" });
  const [auth, setAuth] = useState<AuthStatus>({ state: "unknown" });

  const refreshMe = useCallback(async () => {
    try {
      if (!(await scIsLoggedIn())) {
        setAuth({ state: "loggedOut" });
        return;
      }
      const me = await scGetMe();
      setAuth({ state: "loggedIn", me });
    } catch (e) {
      setAuth({ state: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    getAppVersion()
      .then((version) => setBackend({ state: "ok", version }))
      .catch((e) => setBackend({ state: "error", message: String(e) }));
    void refreshMe();
  }, [refreshMe]);

  async function checkClientId() {
    setClientId({ state: "loading" });
    try {
      const id = await getClientId();
      setClientId({ state: "ok", masked: mask(id), length: id.length });
    } catch (e) {
      setClientId({ state: "error", message: String(e) });
    }
  }

  async function login() {
    setAuth({ state: "loggingIn" });
    try {
      await scLogin();
      await refreshMe();
    } catch (e) {
      setAuth({ state: "error", message: String(e) });
    }
  }

  async function logout() {
    await scLogout();
    setAuth({ state: "loggedOut" });
  }

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2">
        <h1 className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
          {t.app.name}
        </h1>
        <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
      </div>

      <StatusPill status={backend} />

      <AuthSection status={auth} onLogin={login} onLogout={logout} />

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={checkClientId}
          disabled={clientId.state === "loading"}
          className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {clientId.state === "loading" ? "Извлечение…" : "Извлечь client_id"}
        </button>
        <ClientIdResult status={clientId} />
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: BackendStatus }) {
  const label =
    status.state === "ok"
      ? `${t.status.backendConnected} · v${status.version}`
      : status.state === "error"
        ? t.status.backendError
        : t.status.backendChecking;

  const dot =
    status.state === "ok"
      ? "bg-green-500"
      : status.state === "error"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-card-foreground">
      <span className={cn("h-2 w-2 rounded-full", dot)} />
      {label}
    </div>
  );
}

function AuthSection({
  status,
  onLogin,
  onLogout,
}: {
  status: AuthStatus;
  onLogin: () => void;
  onLogout: () => void;
}) {
  if (status.state === "unknown") return null;

  if (status.state === "loggedIn") {
    const { me } = status;
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        {me.avatar_url && (
          <img
            src={me.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        )}
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {t.auth.loggedInAs}
          </span>
          <span className="font-medium">{me.username}</span>
          {me.followers_count != null && (
            <span className="text-xs text-muted-foreground">
              {me.followers_count} {t.auth.followers}
            </span>
          )}
        </div>
        <button
          onClick={onLogout}
          className="ml-4 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
        >
          {t.auth.logout}
        </button>
      </div>
    );
  }

  const loggingIn = status.state === "loggingIn";
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onLogin}
        disabled={loggingIn}
        className="rounded-md bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loggingIn ? t.auth.loggingIn : t.auth.login}
      </button>
      {status.state === "error" && (
        <p className="max-w-md text-center text-sm text-red-400">
          {t.auth.loginFailed}: {status.message}
        </p>
      )}
    </div>
  );
}

function ClientIdResult({ status }: { status: ClientIdStatus }) {
  if (status.state === "idle") return null;
  if (status.state === "loading")
    return <p className="text-sm text-muted-foreground">SoundCloud…</p>;
  if (status.state === "error")
    return (
      <p className="max-w-md text-center text-sm text-red-400">
        {status.message}
      </p>
    );
  return (
    <p className="font-mono text-sm text-muted-foreground">
      client_id: <span className="text-foreground">{status.masked}</span>{" "}
      <span className="text-xs">({status.length} симв.)</span>
    </p>
  );
}

export default App;
