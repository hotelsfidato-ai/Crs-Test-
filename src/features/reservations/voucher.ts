import {
  MEAL_PLAN_SHORT, MEAL_PLAN_FULL_NAMES, PAYMENT_TERM_LABELS,
  type Reservation, type Hotel, type Customer, type Company, type OrgSettings,
} from "@/data/types";
import { fidatoLogo, BRAND_INK, BRAND_ORANGE } from "@/assets/brand/logoMarkup";

/* ══════════════════════════════════════════════════════════════════
   RESERVATION VOUCHER

   The document the guest presents at the property, and the payload
   n8n emails them.

   ⚠️ Built as data first, HTML second. The same VoucherModel feeds the
   on-screen preview, the printable page and the automation event, so
   the figures on the guest's copy cannot drift from the figures in the
   folio or the ones the property is told.

   ⚠️ Nothing is recomputed here. Every amount is read from the stored
   reservation, which froze it at booking time. Recalculating on render
   would let a later GST change or a rate edit silently restate a
   voucher the guest is already holding.
   ══════════════════════════════════════════════════════════════════ */

export interface VoucherRoomLine {
  index: number;
  roomType: string;
  mealPlan: string;
  mealPlanFull: string;
  season?: string;
  quantity: number;
  occupancy: string;
  ratePerNight: number;
  extras: string;
  lineTotal: number;
}

export interface VoucherModel {
  reference: string;
  status: string;
  bookedOn: string;
  paymentTerm: string;
  paymentTermCode: string;

  guestName: string;
  guestEmail: string;
  guestPhone: string;
  companyName?: string;

  hotelName: string;
  hotelCity: string;
  hotelAddress: string;
  hotelPhone: string;
  hotelEmail: string;
  hotelContactPerson: string;
  mapUrl: string;

  checkIn: string;
  checkOut: string;
  nights: number;
  totalRooms: number;
  totalAdults: number;
  totalChildren: number;

  rooms: VoucherRoomLine[];

  roomCharges: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  gstRate: number;

  /* The property's own acceptance. At least one is always present —
     the repository refuses a booking without it. */
  hotelConfirmationNumber?: string;
  hotelRepName?: string;
  confirmedAt?: string;

  bookedByName: string;
  specialRequests: string;

  org: {
    brandName: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    gstin: string;
    /** Absolute URL for the email logo. Empty means use the default. */
    logoUrl?: string;
  };
}

export interface VoucherSources {
  reservation: Reservation;
  hotel?: Hotel | null;
  customer?: Customer | null;
  company?: Company | null;
  org?: OrgSettings | null;
}

const money = (n: number) =>
  `INR ${Math.round(n).toLocaleString("en-IN")}`;

function longDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function dateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function buildVoucher({
  reservation: r, hotel, customer, company, org,
}: VoucherSources): VoucherModel {
  const rooms: VoucherRoomLine[] = (r.rooms ?? []).map((room, i) => {
    const extras: string[] = [];
    if (room.extraBeds > 0) {
      extras.push(`${room.extraBeds} extra bed${room.extraBeds === 1 ? "" : "s"}`);
    }
    if (room.children > 0) {
      extras.push(`${room.children} child${room.children === 1 ? "" : "ren"}`);
    }

    const lineTotal =
      (room.sellingRate * room.quantity +
        room.extraBedRate * room.extraBeds +
        room.childRate * room.children) * r.nights;

    return {
      index: i + 1,
      roomType: room.roomTypeName,
      mealPlan: MEAL_PLAN_SHORT[room.mealPlan] ?? room.mealPlan,
      mealPlanFull: MEAL_PLAN_FULL_NAMES[room.mealPlan] ?? room.mealPlan,
      season: room.seasonName,
      quantity: room.quantity,
      occupancy: `${room.adults} adult${room.adults === 1 ? "" : "s"}`,
      ratePerNight: room.sellingRate,
      extras: extras.join(", "),
      lineTotal,
    };
  });

  const address = [hotel?.address, hotel?.city, hotel?.state]
    .filter(Boolean)
    .join(", ");

  return {
    reference: r.reference,
    status: r.status,
    bookedOn: longDate(r.createdAt),
    paymentTerm: PAYMENT_TERM_LABELS[r.paymentTerm] ?? r.paymentTerm,
    paymentTermCode: r.paymentTerm,

    guestName: r.customerName,
    guestEmail: customer?.email ?? "",
    guestPhone: customer?.phone ?? "",
    companyName: r.companyName ?? company?.name,

    hotelName: r.hotelName,
    hotelCity: r.hotelCity,
    hotelAddress: address || r.hotelCity,
    hotelPhone: hotel?.phone ?? "",
    hotelEmail: hotel?.email ?? "",
    hotelContactPerson: hotel?.contactPerson ?? "",
    // Built from the address rather than stored — a stale pin is worse
    // than a search that lands the guest in the right place.
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${r.hotelName} ${address || r.hotelCity}`,
    )}`,

    checkIn: longDate(r.checkIn),
    checkOut: longDate(r.checkOut),
    nights: r.nights,
    totalRooms: r.totalRooms,
    totalAdults: r.totalAdults,
    totalChildren: r.totalChildren,

    rooms,

    roomCharges: r.roomCharges,
    discountAmount: r.discountAmount,
    taxAmount: r.taxAmount,
    totalAmount: r.totalAmount,
    gstRate: r.gstRate,

    hotelConfirmationNumber: r.hotelConfirmationNumber,
    hotelRepName: r.hotelRepName,
    confirmedAt: r.confirmedAt ? dateTime(r.confirmedAt) : undefined,

    bookedByName: r.ownerName,
    specialRequests: r.specialRequests ?? "",

    org: {
      brandName: org?.brandName || "Fidato Hotels",
      address: org?.registeredAddress || "",
      phone: org?.supportPhone || "",
      email: org?.supportEmail || "",
      website: "www.fidatohotels.com",
      gstin: org?.gstin || "",
      /* Empty falls back to LOGO_PNG_URL at render time. */
      logoUrl: org?.logoUrl?.trim() || "",
    },
  };
}

/* ── Rendering ─────────────────────────────────────────────────────
   A self-contained HTML document. No external CSS, no webfonts, no
   images — it has to survive being emailed, printed, and opened
   offline at a front desk with no network.                          */

/**
 * The contact block, with absent details omitted rather than left as
 * empty slots.
 *
 * ⚠️ This existed as a fixed template of `address<br>phone · email ·
 * website`, which read correctly only when every field was filled in.
 * On a settings document with none of them — the state every new
 * deployment starts in — a guest received a footer of orphaned
 * separators: " ·  · fidatohotels.com". Joining the parts that exist
 * means an incomplete configuration looks sparse instead of broken.
 */
function orgFooter(v: VoucherModel): string {
  const contact = [v.org.phone, v.org.email, v.org.website]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .map((s) => escape(s))
    .join(" &nbsp;&middot;&nbsp; ");

  return [
    v.org.address?.trim() ? escape(v.org.address.trim()) : "",
    contact,
    v.org.gstin?.trim() ? `GSTIN ${escape(v.org.gstin.trim())}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
}

const escape = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ⚠️ Taken from the logo itself (see logoMarkup.ts) rather than picked
   by eye. The masthead is now the real artwork, so a hand-tuned accent
   sat visibly beside the brand orange instead of matching it. */
const INK = BRAND_INK;
const ORANGE = BRAND_ORANGE;
const GREY = "#67737e";
const LINE = "#e2e5e8";

/**
 * The logo for EMAIL only, as a hosted PNG.
 *
 * ⚠️ Not a choice — a constraint. Gmail strips inline <svg> and refuses
 * `data:` URIs inside <img>, so the one carrier that survives is an
 * absolute https URL. The printable voucher embeds the SVG instead and
 * needs no network at all.
 *
 * ⚠️ Points at Firebase Hosting for this project. Moving to a custom
 * domain means changing it here, or every voucher email already
 * delivered starts showing a broken image. Override per-tenant with
 * OrgSettings.logoUrl when there is one.
 */
export const LOGO_PNG_URL = "https://crstest-9a0c5.web.app/brand/fidato-hotels.png";

export function renderVoucherHtml(v: VoucherModel): string {
  const row = (label: string, value: string) =>
    value && value !== "—"
      ? `<tr>
           <td style="padding:3px 16px 3px 0;color:${GREY};font-size:12px;white-space:nowrap;vertical-align:top">${escape(label)}</td>
           <td style="padding:3px 0;color:${INK};font-size:12px;font-weight:600">${escape(value)}</td>
         </tr>`
      : "";

  const roomRows = v.rooms
    .map(
      (room) => `
      <tr>
        <td style="padding:10px 8px 10px 0;border-bottom:1px solid ${LINE};vertical-align:top">
          <div style="font-weight:700;color:${INK};font-size:12px">
            Room ${room.index} &middot; ${escape(room.roomType)}
          </div>
          <div style="color:${GREY};font-size:11px;margin-top:2px">
            ${escape(room.mealPlan)} — ${escape(room.mealPlanFull)}${
              room.season ? ` &middot; ${escape(room.season)}` : ""
            }
          </div>
          ${
            room.extras
              ? `<div style="color:${GREY};font-size:11px;margin-top:2px">${escape(room.extras)}</div>`
              : ""
          }
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:center;color:${INK};font-size:12px;vertical-align:top">
          ${room.quantity}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:center;color:${GREY};font-size:12px;vertical-align:top">
          ${escape(room.occupancy)}
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};font-size:12px;vertical-align:top;white-space:nowrap">
          ${money(room.ratePerNight)}
        </td>
        <td style="padding:10px 0 10px 8px;border-bottom:1px solid ${LINE};text-align:right;color:${INK};font-size:12px;font-weight:700;vertical-align:top;white-space:nowrap">
          ${money(room.lineTotal)}
        </td>
      </tr>`,
    )
    .join("");

  const totalRow = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:4px 0;color:${bold ? INK : GREY};font-size:${bold ? "13px" : "12px"};font-weight:${bold ? 700 : 400}">${escape(label)}</td>
      <td style="padding:4px 0 4px 24px;text-align:right;color:${INK};font-size:${bold ? "15px" : "12px"};font-weight:${bold ? 700 : 600};white-space:nowrap">${escape(value)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reservation voucher ${escape(v.reference)} — ${escape(v.org.brandName)}</title>
<style>
  /* ⚠️ Fixed A4 width. This document is printed and emailed far more
     often than it is scrolled, so it is laid out for the page. */
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif;
    color: ${INK};
    background: #f4f5f6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 210mm; min-height: 297mm; margin: 16px auto; padding: 16mm 14mm;
    background: #fff;
  }
  @media print {
    body { background: #fff; }
    .sheet { width: auto; min-height: 0; margin: 0; padding: 0; }
    .no-print { display: none !important; }
  }
  h1, h2, h3 { margin: 0; }
  table { border-collapse: collapse; width: 100%; }
  .label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: ${GREY}; font-weight: 700; }
</style>
</head>
<body>
<div class="sheet">

  <!-- Masthead -->
  <table>
    <tr>
      <td style="vertical-align:middle">
        <!-- ⚠️ The real mark, inline. Printing and offline viewing are
             the two things this document exists for, and both rule out
             a linked image. -->
        ${fidatoLogo(196)}
      </td>
      <td style="text-align:right;vertical-align:middle">
        <div style="display:inline-block;border-left:4px solid ${ORANGE};padding-left:10px">
          <div style="font-size:15px;font-weight:800;letter-spacing:.06em;color:${INK}">
            RESERVATION VOUCHER
          </div>
          <div style="font-size:12px;color:${GREY};margin-top:2px">
            ${escape(v.reference)}
          </div>
        </div>
      </td>
    </tr>
  </table>

  <div style="height:3px;background:${ORANGE};margin:12px 0 0"></div>
  <div style="height:1px;background:${LINE};margin-bottom:16px"></div>

  <!-- Status strip -->
  <table style="background:#fafbfb;border:1px solid ${LINE};border-radius:6px">
    <tr>
      <td style="padding:10px 14px;width:25%">
        <div class="label">Booked on</div>
        <div style="font-size:13px;font-weight:600;margin-top:3px">${escape(v.bookedOn)}</div>
      </td>
      <td style="padding:10px 14px;width:25%;border-left:1px solid ${LINE}">
        <div class="label">Status</div>
        <div style="font-size:13px;font-weight:700;margin-top:3px;color:#1f6f5c;text-transform:capitalize">
          ${escape(v.status.replace(/_/g, " "))}
        </div>
      </td>
      <td style="padding:10px 14px;width:25%;border-left:1px solid ${LINE}">
        <div class="label">Payment</div>
        <div style="font-size:13px;font-weight:600;margin-top:3px">
          ${escape(v.paymentTermCode)} — ${escape(v.paymentTerm)}
        </div>
      </td>
      <td style="padding:10px 14px;width:25%;border-left:1px solid ${LINE};text-align:right">
        <div class="label">Total</div>
        <div style="font-size:15px;font-weight:800;margin-top:3px">${money(v.totalAmount)}</div>
      </td>
    </tr>
  </table>

  <!-- Hotel + guest -->
  <table style="margin-top:18px">
    <tr>
      <td style="width:50%;vertical-align:top;padding-right:14px">
        <div class="label" style="margin-bottom:6px">Hotel</div>
        <div style="font-size:15px;font-weight:800;color:${INK}">${escape(v.hotelName)}</div>
        <div style="font-size:12px;color:${GREY};margin:4px 0 8px;line-height:1.5">
          ${escape(v.hotelAddress)}
        </div>
        <table>
          ${row("Phone", v.hotelPhone)}
          ${row("Email", v.hotelEmail)}
          ${row("Contact", v.hotelContactPerson)}
          <tr>
            <td style="padding:3px 16px 3px 0;color:${GREY};font-size:12px">Map</td>
            <td style="padding:3px 0;font-size:12px">
              <a href="${escape(v.mapUrl)}" style="color:${ORANGE};font-weight:700;text-decoration:none">
                Open in Google Maps
              </a>
            </td>
          </tr>
        </table>
      </td>
      <td style="width:50%;vertical-align:top;padding-left:14px;border-left:1px solid ${LINE}">
        <div class="label" style="margin-bottom:6px">Guest</div>
        <div style="font-size:15px;font-weight:800;color:${INK}">${escape(v.guestName)}</div>
        ${
          v.companyName
            ? `<div style="font-size:12px;color:${GREY};margin:4px 0 8px">${escape(v.companyName)}</div>`
            : `<div style="height:8px"></div>`
        }
        <table>
          ${row("Email", v.guestEmail)}
          ${row("Phone", v.guestPhone)}
          ${row("Booked by", v.bookedByName)}
        </table>
      </td>
    </tr>
  </table>

  <!-- Stay -->
  <table style="margin-top:18px;border:1px solid ${LINE};border-radius:6px">
    <tr>
      <td style="padding:12px 14px;width:25%">
        <div class="label">Check in</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px">${escape(v.checkIn)}</div>
        <div style="font-size:11px;color:${GREY};margin-top:1px">From 14:00</div>
      </td>
      <td style="padding:12px 14px;width:25%;border-left:1px solid ${LINE}">
        <div class="label">Check out</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px">${escape(v.checkOut)}</div>
        <div style="font-size:11px;color:${GREY};margin-top:1px">By 11:00</div>
      </td>
      <td style="padding:12px 14px;width:25%;border-left:1px solid ${LINE}">
        <div class="label">Nights</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px">${v.nights}</div>
      </td>
      <td style="padding:12px 14px;width:25%;border-left:1px solid ${LINE}">
        <div class="label">Guests</div>
        <div style="font-size:14px;font-weight:700;margin-top:3px">
          ${v.totalRooms} room${v.totalRooms === 1 ? "" : "s"}
        </div>
        <div style="font-size:11px;color:${GREY};margin-top:1px">
          ${v.totalAdults} adult${v.totalAdults === 1 ? "" : "s"}${
            v.totalChildren ? `, ${v.totalChildren} child` : ""
          }
        </div>
      </td>
    </tr>
  </table>

  <!-- Rooms -->
  <div class="label" style="margin:20px 0 8px">Rooms and rates</div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left;padding:0 8px 6px 0;border-bottom:2px solid ${INK}" class="label">Room</th>
        <th style="text-align:center;padding:0 8px 6px;border-bottom:2px solid ${INK}" class="label">Qty</th>
        <th style="text-align:center;padding:0 8px 6px;border-bottom:2px solid ${INK}" class="label">Occupancy</th>
        <th style="text-align:right;padding:0 8px 6px;border-bottom:2px solid ${INK}" class="label">Per night</th>
        <th style="text-align:right;padding:0 0 6px 8px;border-bottom:2px solid ${INK}" class="label">Amount</th>
      </tr>
    </thead>
    <tbody>${roomRows}</tbody>
  </table>

  <!-- Totals -->
  <table style="margin-top:12px">
    <tr>
      <td style="width:55%;vertical-align:top;padding-right:20px">
        ${
          v.specialRequests
            ? `<div class="label" style="margin-bottom:5px">Special requests</div>
               <div style="font-size:12px;color:${INK};line-height:1.55">${escape(v.specialRequests)}</div>`
            : ""
        }
      </td>
      <td style="width:45%;vertical-align:top">
        <table>
          ${totalRow("Room charges", money(v.roomCharges))}
          ${v.discountAmount > 0 ? totalRow("Discount", `− ${money(v.discountAmount)}`) : ""}
          ${totalRow(`GST (${Math.round(v.gstRate * 100)}%)`, money(v.taxAmount))}
          <tr><td colspan="2" style="padding-top:6px;border-top:2px solid ${INK}"></td></tr>
          ${totalRow("Grand total", money(v.totalAmount), true)}
        </table>
      </td>
    </tr>
  </table>

  <!-- ⚠️ The property's own acceptance. This is the block a front desk
       reads when it has no record of the guest, so it is given its own
       highlighted panel rather than buried in a details list. -->
  <div style="margin-top:20px;border:1px solid ${LINE};border-left:4px solid ${ORANGE};border-radius:6px;background:#fffaf7">
    <div style="padding:12px 14px">
      <div class="label" style="color:${ORANGE}">Confirmed by the hotel</div>
      <table style="margin-top:8px">
        <tr>
          ${
            v.hotelConfirmationNumber
              ? `<td style="width:34%;vertical-align:top">
                   <div style="font-size:11px;color:${GREY}">Confirmation number</div>
                   <div style="font-size:14px;font-weight:800;margin-top:2px">${escape(v.hotelConfirmationNumber)}</div>
                 </td>`
              : ""
          }
          ${
            v.hotelRepName
              ? `<td style="width:33%;vertical-align:top">
                   <div style="font-size:11px;color:${GREY}">Confirmed by</div>
                   <div style="font-size:13px;font-weight:700;margin-top:2px">${escape(v.hotelRepName)}</div>
                 </td>`
              : ""
          }
          ${
            v.confirmedAt
              ? `<td style="width:33%;vertical-align:top">
                   <div style="font-size:11px;color:${GREY}">Confirmed at</div>
                   <div style="font-size:13px;font-weight:700;margin-top:2px">${escape(v.confirmedAt)}</div>
                 </td>`
              : ""
          }
        </tr>
      </table>
    </div>
  </div>

  <!-- Policies -->
  <div class="label" style="margin:20px 0 6px">Hotel policies</div>
  <ol style="margin:0;padding-left:16px;color:${GREY};font-size:11px;line-height:1.7">
    <li>Guests must present government photo identity at check in — driving licence, voter ID, Aadhaar or passport.</li>
    <li>A valid credit card may be required to guarantee incidental charges.</li>
    <li>Group reservations follow the FHRAI-IATO and FHRAI-TAAI agreements.</li>
    <li>Cancellation of conference accommodation follows the signed agreement.</li>
    <li>Special requests are subject to availability at check in.</li>
    <li>Please share your company GST number at check in if the stay is billed to a company.</li>
  </ol>

  <!-- Footer -->
  <table style="margin-top:24px;border-top:2px solid ${INK};padding-top:0">
    <tr>
      <td style="padding-top:10px;vertical-align:top;width:50%">
        <div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:${INK}">
          ${escape(v.org.brandName.toUpperCase())}
        </div>
        <div style="font-size:11px;color:${GREY};margin-top:4px;line-height:1.55">
          ${escape(v.org.address)}
        </div>
      </td>
      <td style="padding-top:10px;vertical-align:top;width:50%;text-align:right">
        <div style="font-size:11px;color:${GREY};line-height:1.7">
          ${[v.org.phone, v.org.email, v.org.website, v.org.gstin ? `GSTIN ${v.org.gstin}` : ""]
            .filter(Boolean)
            .map((line) => escape(line))
            .join("<br>")}
        </div>
      </td>
    </tr>
  </table>

  <div style="margin-top:14px;font-size:10px;color:${GREY};text-align:center">
    This voucher confirms the booking described above. Present it at check in.
  </div>

</div>
</body>
</html>`;
}

/**
 * The email. Not a note *about* a voucher — the voucher itself,
 * rebuilt in email-safe markup.
 *
 * ⚠️ Why it is duplicated rather than reusing renderVoucherHtml. That
 * document is an A4 sheet: fixed millimetre widths, @page rules,
 * inline SVG, `border-radius`. Gmail discards <style> blocks entirely,
 * Outlook renders through Word, and neither honours mm widths — so the
 * printable sheet arrives as a broken column. This version is tables,
 * inline styles and pixel widths all the way down, which is what
 * survives. Keep the two in step by hand; there is no shortcut that
 * satisfies both a printer and Outlook.
 *
 * ⚠️ The app does NOT send this. It goes into the automation event and
 * n8n delivers it — the React application never talks to an email
 * provider, which is the boundary the whole architecture rests on.
 */
export function renderVoucherEmail(
  v: VoucherModel,
  logoOverride?: string,
): { subject: string; html: string; text: string } {
  /* Settings first, then the argument, then the built-in default. Serve
     it from the sending domain — see OrgSettings.logoUrl. */
  const logoUrl = v.org.logoUrl?.trim() || logoOverride || LOGO_PNG_URL;
  const subject = `Booking confirmed — ${v.hotelName}, ${v.checkIn} (${v.reference})`;

  const text = [
    `Dear ${v.guestName},`,
    "",
    `Greetings from ${v.org.brandName}.`,
    "",
    `Thank you for choosing us. We are pleased to confirm your booking at ${v.hotelName}, ${v.hotelCity}.`,
    "",
    `Reference:  ${v.reference}`,
    `Check in:   ${v.checkIn}`,
    `Check out:  ${v.checkOut}`,
    `Nights:     ${v.nights}`,
    `Rooms:      ${v.totalRooms}`,
    `Total:      ${money(v.totalAmount)} (${v.paymentTerm})`,
    v.hotelConfirmationNumber ? `Hotel ref:  ${v.hotelConfirmationNumber}` : "",
    "",
    "Your reservation voucher is attached. Please present it at check in.",
    "",
    "Should you need anything further, simply reply to this email.",
    "",
    "With warm regards,",
    `Reservations — ${v.org.brandName}`,
    v.org.phone,
    v.org.email,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const FONT =
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif";

  /** A label/value pair inside one of the strip cells. */
  const cell = (label: string, value: string, hint = "", align = "left") => `
    <td style="padding:11px 14px;vertical-align:top;text-align:${align}">
      <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700">${escape(label)}</div>
      <div style="font-size:13px;font-weight:700;color:${INK};margin-top:3px">${escape(value)}</div>
      ${hint ? `<div style="font-size:10px;color:${GREY};margin-top:1px">${escape(hint)}</div>` : ""}
    </td>`;

  const detail = (label: string, value: string) =>
    value && value !== "—"
      ? `<tr>
           <td style="padding:2px 12px 2px 0;font-size:12px;color:${GREY};white-space:nowrap">${escape(label)}</td>
           <td style="padding:2px 0;font-size:12px;color:${INK};font-weight:600">${escape(value)}</td>
         </tr>`
      : "";

  const roomRows = v.rooms
    .map(
      (room) => `
      <tr>
        <td style="padding:9px 6px 9px 0;border-bottom:1px solid ${LINE};vertical-align:top">
          <div style="font-size:12px;font-weight:700;color:${INK}">Room ${room.index} &middot; ${escape(room.roomType)}</div>
          <div style="font-size:11px;color:${GREY};margin-top:2px">
            ${escape(room.mealPlan)} — ${escape(room.mealPlanFull)}
          </div>
          ${room.extras ? `<div style="font-size:11px;color:${GREY};margin-top:1px">${escape(room.extras)}</div>` : ""}
        </td>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};text-align:center;font-size:12px;color:${INK};vertical-align:top">${room.quantity}</td>
        <td style="padding:9px 6px;border-bottom:1px solid ${LINE};text-align:right;font-size:12px;color:${INK};vertical-align:top;white-space:nowrap">${money(room.ratePerNight)}</td>
        <td style="padding:9px 0 9px 6px;border-bottom:1px solid ${LINE};text-align:right;font-size:12px;font-weight:700;color:${INK};vertical-align:top;white-space:nowrap">${money(room.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const totalLine = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:3px 0;font-size:${bold ? "13px" : "12px"};color:${bold ? INK : GREY};font-weight:${bold ? 700 : 400}">${escape(label)}</td>
      <td style="padding:3px 0 3px 20px;text-align:right;font-size:${bold ? "15px" : "12px"};color:${INK};font-weight:${bold ? 800 : 600};white-space:nowrap">${escape(value)}</td>
    </tr>`;

  const confirmationCells = [
    v.hotelConfirmationNumber
      ? `<td style="vertical-align:top;padding-right:14px">
           <div style="font-size:10px;color:${GREY}">Confirmation number</div>
           <div style="font-size:14px;font-weight:800;color:${INK};margin-top:2px">${escape(v.hotelConfirmationNumber)}</div>
         </td>`
      : "",
    v.hotelRepName
      ? `<td style="vertical-align:top;padding-right:14px">
           <div style="font-size:10px;color:${GREY}">Confirmed by</div>
           <div style="font-size:13px;font-weight:700;color:${INK};margin-top:2px">${escape(v.hotelRepName)}</div>
         </td>`
      : "",
    v.confirmedAt
      ? `<td style="vertical-align:top">
           <div style="font-size:10px;color:${GREY}">Confirmed at</div>
           <div style="font-size:13px;font-weight:700;color:${INK};margin-top:2px">${escape(v.confirmedAt)}</div>
         </td>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f2;${FONT}">

<!-- Preheader: the grey line clients show beside the subject. Hidden in
     the body itself, which is why it is clipped rather than styled. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">
  ${escape(`${v.reference} · ${v.checkIn} → ${v.checkOut} · ${v.totalRooms} room(s) · ${money(v.totalAmount)}`)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f2;padding:24px 10px">
<tr><td align="center">

<table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid ${LINE};${FONT}">

  <tr><td style="height:4px;background:${ORANGE};font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- Masthead. The logo is a hosted PNG because Gmail strips SVG and
       blocks data: URIs; the alt text carries the brand if images are
       blocked, which is the default in many clients. -->
  <tr><td style="padding:22px 26px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:middle">
          <img src="${escape(logoUrl)}" width="180" height="51"
               alt="${escape(v.org.brandName)}"
               style="display:block;border:0;outline:none;text-decoration:none;width:180px;height:51px">
        </td>
        <td style="vertical-align:middle;text-align:right">
          <div style="display:inline-block;border-left:4px solid ${ORANGE};padding-left:9px;text-align:left">
            <div style="font-size:13px;font-weight:800;letter-spacing:.05em;color:${INK}">RESERVATION VOUCHER</div>
            <div style="font-size:12px;color:${GREY};margin-top:2px">${escape(v.reference)}</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 26px"><div style="height:1px;background:${LINE};font-size:0;line-height:0">&nbsp;</div></td></tr>

  <!-- Greeting -->
  <tr><td style="padding:18px 26px 0">
    <p style="margin:0 0 10px;font-size:15px;color:${INK}">Dear ${escape(v.guestName)},</p>
    <p style="margin:0;font-size:14px;color:${INK};line-height:1.6">
      Thank you for choosing ${escape(v.org.brandName)}. We are pleased to confirm your
      booking at <strong>${escape(v.hotelName)}</strong>, ${escape(v.hotelCity)}.
      This email is your voucher — please present it at check in.
    </p>
  </td></tr>

  <!-- Status strip -->
  <tr><td style="padding:16px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};background:#fafbfb">
      <tr>
        ${cell("Booked on", v.bookedOn)}
        ${cell("Status", v.status.replace(/_/g, " "))}
        ${cell("Payment", v.paymentTermCode, v.paymentTerm)}
        ${cell("Total", money(v.totalAmount), "", "right")}
      </tr>
    </table>
  </td></tr>

  <!-- Hotel + guest -->
  <tr><td style="padding:16px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="50%" style="vertical-align:top;padding-right:12px">
          <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700;margin-bottom:5px">Hotel</div>
          <div style="font-size:15px;font-weight:800;color:${INK}">${escape(v.hotelName)}</div>
          <div style="font-size:12px;color:${GREY};margin:3px 0 7px;line-height:1.5">${escape(v.hotelAddress)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            ${detail("Phone", v.hotelPhone)}
            ${detail("Email", v.hotelEmail)}
            ${detail("Contact", v.hotelContactPerson)}
            <tr>
              <td style="padding:2px 12px 2px 0;font-size:12px;color:${GREY}">Map</td>
              <td style="padding:2px 0;font-size:12px">
                <a href="${escape(v.mapUrl)}" style="color:${ORANGE};font-weight:700;text-decoration:none">Open in Google Maps</a>
              </td>
            </tr>
          </table>
        </td>
        <td width="50%" style="vertical-align:top;padding-left:12px;border-left:1px solid ${LINE}">
          <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700;margin-bottom:5px">Guest</div>
          <div style="font-size:15px;font-weight:800;color:${INK}">${escape(v.guestName)}</div>
          ${v.companyName ? `<div style="font-size:12px;color:${GREY};margin:3px 0 7px">${escape(v.companyName)}</div>` : `<div style="height:7px;font-size:0">&nbsp;</div>`}
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            ${detail("Email", v.guestEmail)}
            ${detail("Phone", v.guestPhone)}
            ${detail("Booked by", v.bookedByName)}
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Stay -->
  <tr><td style="padding:16px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE}">
      <tr>
        ${cell("Check in", v.checkIn, "From 14:00")}
        ${cell("Check out", v.checkOut, "By 11:00")}
        ${cell("Nights", String(v.nights))}
        ${cell(
          "Guests",
          `${v.totalRooms} room${v.totalRooms === 1 ? "" : "s"}`,
          `${v.totalAdults} adult${v.totalAdults === 1 ? "" : "s"}${v.totalChildren ? `, ${v.totalChildren} child` : ""}`,
        )}
      </tr>
    </table>
  </td></tr>

  <!-- Rooms -->
  <tr><td style="padding:18px 26px 0">
    <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700;margin-bottom:6px">Rooms and rates</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <th align="left" style="padding:0 6px 5px 0;border-bottom:2px solid ${INK};font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY}">Room</th>
        <th align="center" style="padding:0 6px 5px;border-bottom:2px solid ${INK};font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY}">Qty</th>
        <th align="right" style="padding:0 6px 5px;border-bottom:2px solid ${INK};font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY}">Per night</th>
        <th align="right" style="padding:0 0 5px 6px;border-bottom:2px solid ${INK};font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY}">Amount</th>
      </tr>
      ${roomRows}
    </table>
  </td></tr>

  <!-- Totals -->
  <tr><td style="padding:12px 26px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="52%" style="vertical-align:top;padding-right:16px">
          ${
            v.specialRequests
              ? `<div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700;margin-bottom:4px">Special requests</div>
                 <div style="font-size:12px;color:${INK};line-height:1.55">${escape(v.specialRequests)}</div>`
              : "&nbsp;"
          }
        </td>
        <td width="48%" style="vertical-align:top">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${totalLine("Room charges", money(v.roomCharges))}
            ${v.discountAmount > 0 ? totalLine("Discount", `− ${money(v.discountAmount)}`) : ""}
            ${totalLine(`GST (${Math.round(v.gstRate * 100)}%)`, money(v.taxAmount))}
            <tr><td colspan="2" style="padding-top:5px;border-top:2px solid ${INK};font-size:0;line-height:0">&nbsp;</td></tr>
            ${totalLine("Grand total", money(v.totalAmount), true)}
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  ${
    confirmationCells
      ? `<!-- The property's own acceptance. Given its own panel because
              this is the block a front desk reads when it has no record
              of the guest. -->
         <tr><td style="padding:16px 26px 0">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-left:4px solid ${ORANGE};background:#fff8f4">
             <tr><td style="padding:12px 14px">
               <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${ORANGE};font-weight:700;margin-bottom:7px">Confirmed by the hotel</div>
               <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${confirmationCells}</tr></table>
             </td></tr>
           </table>
         </td></tr>`
      : ""
  }

  <!-- Policies -->
  <tr><td style="padding:18px 26px 0">
    <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:${GREY};font-weight:700;margin-bottom:5px">Hotel policies</div>
    <ol style="margin:0;padding-left:16px;color:${GREY};font-size:11px;line-height:1.7">
      <li>Guests must present government photo identity at check in — driving licence, voter ID, Aadhaar or passport.</li>
      <li>A valid credit card may be required to guarantee incidental charges.</li>
      <li>Special requests are subject to availability at check in.</li>
      <li>Please share your company GST number at check in if the stay is billed to a company.</li>
    </ol>
  </td></tr>

  <tr><td style="padding:18px 26px 22px">
    <p style="margin:0 0 3px;font-size:14px;color:${INK}">With warm regards,</p>
    <p style="margin:0;font-size:14px;color:${INK};font-weight:700">Reservations</p>
    <p style="margin:2px 0 0;font-size:13px;color:${GREY}">${escape(v.org.brandName)}</p>
  </td></tr>

  <tr><td style="padding:14px 26px;background:#fafbfb;border-top:1px solid ${LINE}">
    <div style="font-size:11px;color:${GREY};line-height:1.6">
      ${orgFooter(v)}
    </div>
  </td></tr>

</table>

<div style="font-size:10px;color:#8b959d;margin-top:12px;${FONT}">
  This voucher confirms the booking described above.
</div>

</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
