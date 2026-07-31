import type { ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { Page, PageHeader, Button } from "@/components/ui";
import { toast } from "@/components/ui";
import { dateShort } from "@/lib/format";
import { TODAY } from "@/data/repositories";

/* Shared chrome for every report: breadcrumb, export affordances and
   a Georgia-set cover strip that carries the brand serif into the
   one place it still belongs — printed output. */

export function ReportShell({
  title, description, filters, children,
}: {
  title: string;
  description: string;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reports", to: "/reports" }, { label: title }]}
        title={title}
        description={description}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Download className="size-4" />}
              onClick={() =>
                toast.success(
                  "Export queued",
                  "In Phase 2 this generates a CSV and emails it to you.",
                )
              }
            >
              Export
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Printer className="size-4" />}
              onClick={() => window.print()}
              className="no-print"
            >
              Print
            </Button>
          </>
        }
      >
        {filters}
      </PageHeader>

      {/* Only visible on paper — the brand serif cover line. */}
      <div className="hidden print:block mb-6 print-serif">
        <p className="text-2xl">Fidato Hotels</p>
        <p className="text-base">
          {title} · generated {dateShort(TODAY)}
        </p>
      </div>

      {children}
    </Page>
  );
}
