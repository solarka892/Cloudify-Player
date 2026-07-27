import { useEffect, useState } from "react";
import { getAppVersion } from "@/lib/tauri";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type BackendStatus =
  | { state: "checking" }
  | { state: "ok"; version: string }
  | { state: "error"; message: string };

function App() {
  const [backend, setBackend] = useState<BackendStatus>({ state: "checking" });

  useEffect(() => {
    getAppVersion()
      .then((version) => setBackend({ state: "ok", version }))
      .catch((e) =>
        setBackend({ state: "error", message: String(e) }),
      );
  }, []);

  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background text-foreground">
      <div className="flex flex-col items-center gap-2">
        <h1 className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
          {t.app.name}
        </h1>
        <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
      </div>

      <StatusPill status={backend} />
    </main>
  );
}

function StatusPill({ status }: { status: BackendStatus }) {
  const label =
    status.state === "ok"
      ? `${t.status.backendConnected} · v${status.version}`
      : status.state === "error"
        ? `${t.status.backendError}`
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

export default App;
