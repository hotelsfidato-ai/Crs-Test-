import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RefreshCw, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   ERROR BOUNDARY

   ⚠️ This exists because a blank white page is the worst possible
   failure. React unmounts the whole tree when a render throws, so a
   single `undefined.length` deep in one card takes the entire screen
   with it — and leaves nothing on it to explain why. Every such
   report so far has cost a round trip of screenshots to locate.

   It cannot prevent the crash. What it does is turn "the page is
   white" into "this component threw this error on this route", which
   is the difference between a bug report and a guess.

   ⚠️ Deliberately shows the real message and stack. This is an
   internal back office, not a public site — the people who see this
   are the people who report it, and a generic "something went wrong"
   would throw away the only useful thing on screen.
   ══════════════════════════════════════════════════════════════════ */

interface Props {
  children: ReactNode;
  /** Remounts the boundary when this changes — e.g. the route path. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? "" });
    // Kept: the console trace is what a developer opens first.
    // eslint-disable-next-line no-console
    console.error("[fidato] screen crashed", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    // Navigating away from a broken screen must clear the error, or the
    // whole app appears stuck on it.
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, componentStack: "" });
    }
  }

  private report = () => {
    const { error, componentStack } = this.state;
    const text = [
      `Route: ${window.location.pathname}`,
      `Error: ${error?.name}: ${error?.message}`,
      "",
      error?.stack ?? "",
      "",
      "Component stack:",
      componentStack,
    ].join("\n");
    void navigator.clipboard?.writeText(text);
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    /* The component that actually threw, pulled off the top of the
       stack — the single most useful line, so it goes above the fold
       rather than inside a collapsed details element. */
    const culprit =
      componentStack
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith("at "))
        ?.replace(/^at\s+/, "")
        .split(" ")[0] ?? "Unknown component";

    return (
      <div className="max-w-2xl mx-auto py-12 px-5">
        <div className="flex items-start gap-3">
          <AlertOctagon className="size-5 text-brand-red shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink-900 tracking-tight">
              This screen stopped working
            </h1>
            <p className="text-base text-grey-600 mt-1.5 leading-relaxed">
              Nothing was saved or lost — the failure is in displaying this page, not in
              your data. The details below are what a developer needs.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-md border border-grey-200 overflow-hidden">
          <dl className="divide-y divide-grey-100 text-base">
            <Row label="Where" value={window.location.pathname} />
            <Row label="Component" value={culprit} />
            <Row label="Error" value={`${error.name}: ${error.message}`} tone="danger" />
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <Button
            leadingIcon={<RefreshCw className="size-4" />}
            onClick={() => window.location.reload()}
          >
            Reload the page
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<ClipboardCopy className="size-4" />}
            onClick={this.report}
          >
            Copy details
          </Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>

        <details className="mt-6">
          <summary className="text-sm text-grey-500 cursor-pointer hover:text-ink-900">
            Full stack trace
          </summary>
          <pre className="mt-3 p-4 rounded-md bg-grey-50 border border-grey-200 text-xs text-grey-600 overflow-x-auto whitespace-pre-wrap">
            {error.stack}
            {componentStack && `\n\nComponent stack:${componentStack}`}
          </pre>
        </details>
      </div>
    );
  }
}

function Row({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 px-4 py-3">
      <dt className="text-sm text-grey-500">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-brand-red font-mono text-sm break-words"
            : "text-ink-900 font-mono text-sm break-words"
        }
      >
        {value}
      </dd>
    </div>
  );
}
