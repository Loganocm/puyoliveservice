import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface State {
  error: Error | null;
}

/**
 * Catches a render error anywhere in the interface and shows a way back,
 * instead of the blank screen React leaves when an error goes uncaught. The
 * game canvas lives outside React and is unaffected.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ui] render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 pointer-events-auto" role="alert">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-black/80 backdrop-blur-md p-6 text-white">
          <h1 className="text-2xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-sm text-white/70 mb-4">
            The menus hit an error and stopped. Reloading usually fixes it; your settings are kept.
          </p>
          <pre className="text-xs text-white/50 bg-white/5 rounded-lg p-3 mb-5 overflow-x-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl font-semibold"
            style={{ background: "var(--pl-accent-primary)" }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
