import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, FileText, Mail } from "lucide-react";
import {
  hotelsRepo, customersRepo, companiesRepo, adminRepo,
} from "@/data/repositories";
import {
  Button, Dialog, DialogContent, DialogTrigger, DialogClose, Skeleton, toast,
  describeError,
} from "@/components/ui";
import { buildVoucher, renderVoucherHtml } from "./voucher";
import { voucherPdfBlob, voucherPdfFilename, qrOptions } from "./voucherPdf";
import type { Reservation } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   VOUCHER

   Preview, print and download, from the reservation.

   ⚠️ Download produces a real PDF, drawn with jsPDF — see voucherPdf.
   It used to hand over the HTML and tell the user to print it, which
   is not a document you can forward to a guest or attach to a booking
   thread. The same generator produces the copy n8n attaches to the
   email, uploads to Drive and sends over WhatsApp, so what is checked
   here is byte-for-byte what the guest receives.

   ⚠️ Print still uses the HTML sheet rather than the PDF. The browser's
   own print pipeline handles page setup and margins better than
   handing it a pre-made PDF does, and the HTML carries @page rules.
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

  const [building, setBuilding] = useState(false);

  async function download() {
    if (!model) return;
    setBuilding(true);
    try {
      const blob = await voucherPdfBlob(model, qrOptions(sources.data?.org));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = voucherPdfFilename(model);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Voucher downloaded", voucherPdfFilename(model));
    } catch (error) {
      const detail = describeError(error);
      toast.error(detail.title ?? "Could not build the PDF", detail.message ?? "Nothing was saved.");
    } finally {
      setBuilding(false);
    }
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
              disabled={!model}
              loading={building}
              onClick={() => void download()}
            >
              Download PDF
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
