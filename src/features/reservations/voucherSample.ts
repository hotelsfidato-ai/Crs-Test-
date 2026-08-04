import { buildVoucher, renderVoucherHtml, renderVoucherEmail } from "./voucher";
import { voucherPdfBase64, voucherPdfFilename, qrOptions } from "./voucherPdf";
import type { WebhookPayload } from "@/lib/webhook";
import type { OrgSettings, Reservation, Hotel, Customer } from "@/data/types";

/* ══════════════════════════════════════════════════════════════════
   THE TEST PAYLOAD

   ⚠️ Built through the SAME render path as a real booking, on purpose.

   The previous version was a hand-written object listing a few fields.
   It carried no `to`, no `email.html`, no `voucher.html` — none of the
   things a real reservation.created event actually sends — while its
   doc comment claimed it exercised the real shape.

   The consequence was not theoretical. Someone read the test output,
   concluded the CRS "only sends booking data", and rebuilt an entire
   n8n workflow around fields that do not exist in production while
   ignoring the ones that do. A test fixture that differs in shape from
   the thing it stands in for does not merely fail to catch bugs — it
   actively teaches the wrong thing.

   So this goes through buildVoucher → renderVoucherEmail →
   renderVoucherHtml exactly as reservationsRepo.create does. If the
   real payload gains a field, this gains it too, because it is the
   same code.
   ══════════════════════════════════════════════════════════════════ */

const SAMPLE_RESERVATION = {
  id: "sample",
  reference: "FH-2026-00000",
  status: "confirmed",
  createdAt: new Date().toISOString(),
  paymentTerm: "DP",
  channel: "direct_sales",
  customerId: "sample-customer",
  customerName: "Sample Guest",
  hotelId: "sample-hotel",
  hotelName: "Sample Property",
  hotelCity: "Pune",
  checkIn: "2026-08-12",
  checkOut: "2026-08-15",
  nights: 3,
  totalRooms: 1,
  totalAdults: 2,
  totalChildren: 0,
  rooms: [
    {
      roomTypeId: "sample-room",
      roomTypeName: "Deluxe Room",
      mealPlan: "CP",
      quantity: 1,
      adults: 2,
      children: 0,
      extraBeds: 0,
      sellingRate: 6_500,
      extraBedRate: 0,
      childRate: 0,
    },
  ],
  guests: [],
  roomCharges: 19_500,
  extrasCharges: 0,
  discountAmount: 0,
  discountPercent: 0,
  taxAmount: 3_510,
  totalAmount: 24_150,
  gstRate: 0.18,
  ownerId: "sample-owner",
  ownerName: "Sample Salesperson",
  hotelConfirmationNumber: "SAMPLE-001",
  hotelRepName: "Sample Manager",
  confirmedAt: new Date().toISOString(),
  specialRequests: "Late check-in expected.",
  internalNotes: "",
} as unknown as Reservation;

const SAMPLE_HOTEL = {
  id: "sample-hotel",
  name: "Sample Property",
  city: "Pune",
  state: "Maharashtra",
  address: "12 Sample Road",
  phone: "+91 20 0000 0000",
  email: "stay@example.com",
  contactPerson: "Sample Manager",
} as unknown as Hotel;

const SAMPLE_CUSTOMER = {
  id: "sample-customer",
  fullName: "Sample Guest",
  email: "guest@example.com",
  phone: "+91 90000 00000",
} as unknown as Customer;

/**
 * A test event shaped exactly like `reservation.created`.
 *
 * `attachPdf` mirrors the saved setting so the test shows what the
 * workflow will actually receive — including whether `pdfBase64` is
 * populated, which decides whether a no-converter workflow can run.
 */
export async function sampleVoucherPayload(
  org?: OrgSettings | null,
  attachPdf = false,
): Promise<WebhookPayload> {
  const voucher = buildVoucher({
    reservation: SAMPLE_RESERVATION,
    hotel: SAMPLE_HOTEL,
    customer: SAMPLE_CUSTOMER,
    company: null,
    org: org ?? null,
  });

  const mail = renderVoucherEmail(voucher);

  let pdfBase64 = "";
  if (attachPdf) {
    try {
      pdfBase64 = await voucherPdfBase64(voucher, qrOptions(org));
    } catch {
      /* Same tolerance as the real path — the test still shows the
         shape, with the field empty. */
    }
  }

  return {
    event: "test",
    sentAt: new Date().toISOString(),
    source: "fidato-crs",
    data: {
      /* ⚠️ Kept so a workflow that fires on a test cannot mistake it for
         a booking. Everything else matches production exactly. */
      note: "Test from Fidato CRS. No booking was created.",

      reservation: SAMPLE_RESERVATION,
      customer: SAMPLE_CUSTOMER,
      company: null,
      hotel: SAMPLE_HOTEL,

      to: SAMPLE_CUSTOMER.email,
      guestPhone: SAMPLE_CUSTOMER.phone,
      email: { subject: mail.subject, html: mail.html, text: mail.text },
      voucher: {
        reference: voucher.reference,
        html: renderVoucherHtml(voucher),
        filename: voucherPdfFilename(voucher),
        pdfBase64,
        pdfMimeType: "application/pdf",
        model: voucher,
      },
    },
  };
}
