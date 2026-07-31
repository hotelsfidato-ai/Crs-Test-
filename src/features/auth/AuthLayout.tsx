import type { ReactNode } from "react";
import logoFull from "@/assets/brand/logo-full.svg";

/* ══════════════════════════════════════════════════════════════════
   AUTH LAYOUT

   Deliberately plain. This is the one screen a stranger can reach, so
   it says as little about the system as possible — no counts, no
   property names, no hint of what is inside.
   ══════════════════════════════════════════════════════════════════ */

export function AuthLayout({
  title, description, children, footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-grey-50 px-5 py-10">
      <div className="w-full max-w-[400px]">
        <img
          src={logoFull}
          alt="Fidato Hotels"
          className="h-8 w-auto mx-auto mb-8"
        />

        <div className="bg-white border border-grey-200 rounded-lg p-7">
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight">{title}</h1>
          <p className="text-sm text-grey-600 mt-1.5 leading-relaxed">{description}</p>

          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="text-center mt-5 text-sm text-grey-500">{footer}</div>}

        <p className="text-center text-2xs text-grey-400 mt-8">
          Fidato Hospitality Platform · Internal use only
        </p>
      </div>
    </div>
  );
}
