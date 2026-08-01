import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, FileText, Mail } from "lucide-react";
import {
  hotelsRepo, customersRepo, companiesRepo, adminRepo,
} from "@/data/repositories";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose, Skeleton, toast,
} from "@/components/ui";
import { buildVoucher, renderVoucherHtml } from "./voucher";
import type { Reservation } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   VOUCHER

   Preview, print and download, from the reservation.

   ⚠️ No PDF library. The browser's own print-to-PDF produces a better
   document than a client-side renderer would — real text, selectable
   and searchable, correct fonts, A4 pagination — for none of the
   ~400 kB a PDF library costs. The HTML carries @page rules so
   "Save as PDF" lands on A4 without anyone touching the settings.

   ⚠️ The same HTML goes to n8n for the guest's email, so what the
   salesperson checks here is exactly what the guest receives.
   ══════════════════════════════════════════════════════════════════ */

export function VoucherButton({ reservation }: { reservation: Reservation }) {
  const [open, setOpen] = useState(false);

  /* Fetched only when the dialog opens. A voucher needs four documents
     the reservation screen does not otherwise load, and most visits to
     a booking never ask for it. */
  const sources = useQuery({
    queryKey: ["voucher-sources", reservation.id],
    enabled: open,
    queryFn: async () => {
      const [hotel, customer, company, org] = await Promise.all([
        hotelsRepo.get(reservation.hotelId),
        customersRepo.get(reservation.customerId),
        reservation.companyId ? companiesRepo.get(reservation.companyId) : null,
        adminRepo.settings(),
      ]);
      return { hotel, customer, company, org };
    },
  });

  const model = sources.data
    ? buildVoucher({ reservation, ...sources.data })
    : null;
  const html = model ? renderVoucherHtml(model) : "";

  function openPrintable(andPrint: boolean) {
    if (!html) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error("Pop-up blocked", "Allow pop-ups for this site to print the voucher.");
      return;
    }
    win.document.write(html);
    win.document.close();
    if (andPrint) {
      // The document must lay out before the dialog opens, or the
      // preview shows a blank first page.
      win.addEventListener("load", () => win.print());
    }
  }

  function download() {
    if (!html || !model) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Fidato-voucher-${model.reference}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(
      "Voucher downloaded",
      "Open it and print to PDF if the guest needs a PDF copy.",
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" leadingIcon={<FileText className="size-4" />}>
          Voucher
        </Button>
      </DialogTrigger>

      <DialogContent
        title={`Voucher — ${reservation.reference}`}
        description="Exactly what the guest receives by email."
        size="xl"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
            <Button
              variant="secondary"
              leadingIcon={<Download className="size-4" />}
              disabled={!html}
              onClick={download}
            >
              Download
            </Button>
            <Button
              leadingIcon={<Printer className="size-4" />}
              disabled={!html}
              onClick={() => openPrintable(true)}
            >
              Print / Save as PDF
            </Button>
          </>
        }
      >
        {sources.isLoading || !html ? (
          <Skeleton className="h-[420px] w-full" />
        ) : (
          <>
            <div className="rounded-md border border-grey-200 overflow-hidden bg-grey-50">
              {/* srcDoc keeps the voucher's own styles from leaking into
                  the app, and the app's out of the voucher. */}
              <iframe
                title={`Voucher ${reservation.reference}`}
                srcDoc={html}
                className="w-full h-[460px] border-0 bg-white"
              />
            </div>

            <p className="flex items-start gap-2 text-xs text-grey-500 mt-3 leading-relaxed">
              <Mail className="size-3.5 shrink-0 mt-0.5" />
              This platform does not send email. The same document is handed to n8n when the
              booking is created, and n8n delivers it — see Admin → Integrations.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
