import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/i18n";

/**
 * Keeps one broken view from taking the window with it.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which in a desktop shell means the window simply goes blank — no message, no
 * navigation, nothing to report. Wrapping the view area turns that into a
 * legible failure, and leaves the chrome around it working.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The webview console is the only place the stack can be read from.
    console.error("view crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="panel flex flex-col items-start gap-3 p-6">
        <h2 className="label text-lg font-semibold">{t.app.crashed}</h2>
        <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
          {error.message || String(error)}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
        >
          {t.app.reload}
        </button>
      </div>
    );
  }
}
