import { useState, useRef, useEffect } from "react";
import { Sparkles, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUi } from "@/lib/session";
import { Drawer, DrawerContent, Button } from "@/components/ui";
import { answerFor, SUGGESTED_PROMPTS, type ChatTurn } from "@/features/ai/responses";
import { useAssistantSnapshot } from "@/features/ai/useSnapshot";
import logoMark from "@/assets/brand/logo-mark.svg";

/* ══════════════════════════════════════════════════════════════════
   AI PANEL
   The side-panel version of /ai. Phase 1 answers from a scripted
   response set built over the real seed data, so the interaction
   shape is right even though no model is called.
   ══════════════════════════════════════════════════════════════════ */

export function AiPanel() {
  const open = useUi((s) => s.aiPanelOpen);
  const setOpen = useUi((s) => s.setAiPanelOpen);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-orange" />
            AI Assistant
          </span>
        }
        description="Ask about bookings, accounts and performance."
        width="md"
      >
        <AiConversation compact />
      </DrawerContent>
    </Drawer>
  );
}

export function AiConversation({ compact = false }: { compact?: boolean }) {
  const { snapshot } = useAssistantSnapshot();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || thinking) return;
    setDraft("");
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setThinking(true);

    // Simulated model latency — the shape of the wait matters for the UX.
    const reply = await new Promise<ChatTurn>((resolve) =>
      setTimeout(() => resolve(answerFor(q, snapshot)), 700 + Math.random() * 600),
    );

    setThinking(false);
    setTurns((prev) => [...prev, reply]);
  }

  return (
    <div className={cn("flex flex-col", compact ? "h-full" : "h-[calc(100vh-260px)] min-h-[440px]")}>
      <div className="flex-1 overflow-y-auto scrollbar-quiet px-5 py-4">
        {turns.length === 0 ? (
          <div className="py-6">
            <div className="flex items-center justify-center size-11 rounded-full bg-brand-orange-50 mb-4 mx-auto">
              <img src={logoMark} alt="" className="size-5" />
            </div>
            <p className="text-md font-semibold text-ink-900 text-center">
              What would you like to know?
            </p>
            <p className="text-sm text-grey-500 text-center mt-1.5 max-w-xs mx-auto leading-relaxed">
              I can summarise performance, find records and draft messages from your
              live platform data.
            </p>

            <div className="mt-6 space-y-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  className={cn(
                    "block w-full text-left px-3 py-2.5 rounded-md text-base",
                    "bg-white border border-grey-200 text-grey-700",
                    "hover:border-grey-300 hover:bg-grey-50 hover:text-ink-900",
                    "transition-colors duration-150",
                  )}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, i) => (
              <Turn key={i} turn={turn} />
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-sm text-grey-500">
                <span className="flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="140ms" />
                  <Dot delay="280ms" />
                </span>
                Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-center gap-2 px-5 py-3.5 border-t border-grey-200 bg-white shrink-0"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything…"
          className={cn(
            "flex-1 min-w-0 h-9 px-3 text-base bg-white text-ink-900 placeholder:text-grey-400",
            "border border-grey-300 rounded-md",
            "hover:border-grey-400 transition-colors duration-150",
            "focus:border-brand-orange focus:outline-none focus:ring-2 focus:ring-brand-orange/20",
          )}
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
    </div>
  );
}

function Turn({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] px-3.5 py-2.5 rounded-lg rounded-br-sm bg-ink-900 text-white text-base leading-relaxed">
          {turn.content}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <span className="flex items-center justify-center size-6 rounded-full bg-brand-orange-50 shrink-0 mt-0.5">
        <img src={logoMark} alt="" className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base text-ink-900 leading-relaxed whitespace-pre-wrap">
          {turn.content}
        </div>
        {turn.footnote && (
          <p className="text-2xs text-grey-400 mt-2 italic">{turn.footnote}</p>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 rounded-full bg-grey-400 animate-bounce"
      style={{ animationDelay: delay, animationDuration: "900ms" }}
    />
  );
}
