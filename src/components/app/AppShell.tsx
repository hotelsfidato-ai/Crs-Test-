import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useUi } from "@/lib/session";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AiPanel } from "./AiPanel";
import { Toaster, TooltipProvider } from "@/components/ui";

/* ══════════════════════════════════════════════════════════════════
   APP SHELL
   Fixed sidebar and top bar; the page scrolls inside. On tablet and
   below the sidebar becomes a drawer so the content keeps full width.
   ══════════════════════════════════════════════════════════════════ */

export function AppShell() {
  const mobileNavOpen = useUi((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUi((s) => s.setMobileNavOpen);
  const { pathname } = useLocation();

  /* Safety net for a known Radix behaviour: a modal that unmounts while
     still open can leave `pointer-events: none` on <body>, which makes
     the entire application unclickable with no visible cause. On every
     route change, if nothing is actually open, clear the stale lock. */
  useEffect(() => {
    if (document.querySelector("[data-radix-focus-guard]")) return;
    if (document.body.style.pointerEvents === "none") {
      document.body.style.removeProperty("pointer-events");
    }
    document.body.removeAttribute("data-scroll-locked");
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen overflow-hidden bg-grey-50">
        {/* Desktop rail */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Tablet / mobile drawer */}
        <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-[2px] motion-fade lg:hidden" />
            <DialogPrimitive.Content className="fixed left-0 top-0 z-50 h-full motion-drawer-left lg:hidden">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Main application navigation
              </DialogPrimitive.Description>
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          {/* ⚠️ `relative` is load-bearing. An absolutely-positioned element
              with no positioned ancestor anchors to the DOCUMENT, not to
              this scroll area — it escapes both overflow boxes and makes
              the document taller than the window. The import page's
              hidden file input did exactly that: "Choose file" scrolled
              the whole document, shoving the shell up and leaving a blank
              band beneath it. Making <main> the containing block keeps
              every such element inside the page that owns it. */}
          <main className="relative flex-1 overflow-y-auto scrollbar-quiet">
            <Outlet />
          </main>
        </div>

        <CommandPalette />
        <AiPanel />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
