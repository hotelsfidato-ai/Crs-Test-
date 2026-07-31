import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Send, RotateCcw, Info, FileText, Mail } from "lucide-react";
import { cn } from "@/lib/cn";
import { useCurrentUser } from "@/lib/session";
import { answerFor, SUGGESTED_PROMPTS, type ChatTurn } from "./responses";
import {
  Page, PageHeader, Card, CardHeader, CardBody, Button, Textarea,
  StatusPill, toast,
} from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   AI WORKSPACE
   Phase 1 answers from the seed data rather than a model, so every
   figure the assistant quotes matches the dashboards exactly. The
   component contract is what Phase 2 will keep when a real
   completion call goes in behind answerFor().
   ══════════════════════════════════════════════════════════════════ */

const GENERATORS = [
  {
    icon: Mail,
    title: "Follow-up email",
    description: "Chase an overdue invoice without souring the account",
    prompt: "Draft a follow-up email for an overdue invoice",
  },
  {
    icon: FileText,
    title: "Account summary",
    description: "Brief yourself before a call with a corporate client",
    prompt: "Who are our top five accounts?",
  },
];

export default function AiPage() {
  const user = useCurrentUser();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || thinking) return;

    setTurns((prev) => [...prev, { role: "user", content: trimmed }]);
    setDraft("");
    setThinking(true);

    // A brief pause so the exchange reads as a conversation rather
    // than an instant lookup.
    window.setTimeout(() => {
      setTurns((prev) => [...prev, answerFor(trimmed)]);
      setThinking(false);
    }, 420);
  }

  return (
    <Page>
      <PageHeader
        title="Assistant"
        description="Ask about the portfolio, or generate a draft. Answers are computed from live platform data."
        badge={<StatusPill tone="accent" dot={false}>Phase 1 — scripted</StatusPill>}
        actions={
          turns.length > 0 && (
            <Button
              variant="secondary"
              leadingIcon={<RotateCcw className="size-4" />}
              onClick={() => setTurns([])}
            >
              Clear
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
        <Card className="flex flex-col min-h-[560px]">
          {/* ── Transcript ── */}
          <div className="flex-1 overflow-y-auto scrollbar-quiet p-5 space-y-5">
            {turns.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center h-full py-12">
                <span className="flex items-center justify-center size-11 rounded-full brand-gradient text-white mb-4">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="text-md font-semibold text-ink-900">
                  Good to see you, {user.name.split(" ")[0]}
                </h2>
                <p className="text-base text-grey-500 mt-1.5 max-w-sm leading-relaxed">
                  Ask about revenue, occupancy, approvals or any account. Everything is
                  read from the same data the dashboards use.
                </p>

                <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-lg">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => ask(prompt)}
                      className={cn(
                        "px-3 py-1.5 rounded-full border border-grey-200 bg-white",
                        "text-sm text-grey-700 hover:border-brand-orange hover:text-brand-orange",
                        "transition-colors duration-150",
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((turn, i) => <Turn key={i} turn={turn} />)
            )}

            {thinking && (
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center size-7 rounded-full brand-gradient text-white shrink-0">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="flex items-center gap-1 h-7">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 rounded-full bg-grey-300 animate-pulse"
                      style={{ animationDelay: `${i * 140}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* ── Composer ── */}
          <div className="border-t border-grey-200 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                rows={1}
                placeholder="Ask about revenue, occupancy, an account…"
                className="resize-none min-h-[40px] max-h-32"
                aria-label="Message the assistant"
              />
              <Button
                type="submit"
                variant="primary"
                size="icon"
                disabled={!draft.trim() || thinking}
                aria-label="Send"
              >
                <Send className="size-4" />
              </Button>
            </form>
            <p className="text-2xs text-grey-400 mt-2">
              Enter to send · Shift + Enter for a new line
            </p>
          </div>
        </Card>

        {/* ── Side rail ── */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Generate" description="Drafts you can edit and send" />
            <CardBody className="pt-0 space-y-2">
              {GENERATORS.map((gen) => {
                const Icon = gen.icon;
                return (
                  <button
                    key={gen.title}
                    type="button"
                    onClick={() => ask(gen.prompt)}
                    className={cn(
                      "flex items-start gap-3 w-full text-left p-3 rounded-md",
                      "border border-grey-200 bg-white hover:border-grey-300",
                      "transition-colors duration-150",
                    )}
                  >
                    <span className="flex items-center justify-center size-8 rounded-md bg-brand-orange-50 text-brand-orange shrink-0">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-medium text-ink-900">
                        {gen.title}
                      </span>
                      <span className="block text-sm text-grey-500 mt-0.5 leading-relaxed">
                        {gen.description}
                      </span>
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  toast.info(
                    "Proposal generator",
                    "Arrives in Phase 2 with the model integration.",
                  )
                }
                className={cn(
                  "flex items-start gap-3 w-full text-left p-3 rounded-md",
                  "border border-dashed border-grey-300 bg-grey-50",
                  "hover:border-grey-400 transition-colors duration-150",
                )}
              >
                <span className="flex items-center justify-center size-8 rounded-md bg-grey-200 text-grey-400 shrink-0">
                  <FileText className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-medium text-grey-600">
                    Proposal generator
                  </span>
                  <span className="block text-sm text-grey-500 mt-0.5">Phase 2</span>
                </span>
              </button>
            </CardBody>
          </Card>

          <Card className="bg-grey-50">
            <CardBody className="flex items-start gap-2.5">
              <Info className="size-4 text-grey-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-ink-900">How this works today</p>
                <p className="text-sm text-grey-600 mt-1 leading-relaxed">
                  No language model is called. Answers are computed directly from the
                  reservations, invoices and properties in the platform, which is why the
                  figures always agree with{" "}
                  <Link to="/reports" className="text-brand-orange hover:underline">
                    Reports
                  </Link>
                  . Phase 2 puts a real model behind the same interface.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-br-sm bg-ink-900 text-white px-4 py-2.5">
          <p className="text-base leading-relaxed whitespace-pre-line">{turn.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="flex items-center justify-center size-7 rounded-full brand-gradient text-white shrink-0 mt-0.5">
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base text-ink-900 leading-relaxed whitespace-pre-line">
          {turn.content}
        </p>
        {turn.footnote && (
          <p className="text-2xs text-grey-400 mt-2.5 pt-2.5 border-t border-grey-100">
            {turn.footnote}
          </p>
        )}
      </div>
    </div>
  );
}
