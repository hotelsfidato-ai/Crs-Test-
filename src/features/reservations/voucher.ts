import {
  MEAL_PLAN_SHORT, MEAL_PLAN_FULL_NAMES, PAYMENT_TERM_LABELS,
  type Reservation, type Hotel, type Customer, type Company, type OrgSettings,
} from "@/data/types";

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
    },
  };
}

/* ── Rendering ─────────────────────────────────────────────────────
   A self-contained HTML document. No external CSS, no webfonts, no
   images — it has to survive being emailed, printed, and opened
   offline at a front desk with no network.                          */

const escape = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const INK = "#031728";
const ORANGE = "#df6128";
const GREY = "#67737e";
const LINE = "#e2e5e8";

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
        <div style="font-size:26px;font-weight:800;letter-spacing:.14em;color:${INK};line-height:1">
          FIDATO
        </div>
        <div style="font-size:11px;letter-spacing:.42em;color:${ORANGE};font-weight:700;margin-top:3px">
          HOTELS
        </div>
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
          ${escape(v.org.phone)}<br>
          ${escape(v.org.email)}<br>
          ${escape(v.org.website)}
          ${v.org.gstin ? `<br>GSTIN ${escape(v.org.gstin)}` : ""}
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
 * The covering email.
 *
 * ⚠️ The app does NOT send this. It goes into the automation event and
 * n8n delivers it — the React application never talks to an email
 * provider, which is the boundary the whole architecture rests on.
 */
export function renderVoucherEmail(v: VoucherModel): { subject: string; html: string; text: string } {
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

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f5f6">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;padding:24px 12px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid ${LINE};border-radius:8px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">

  <tr><td style="height:4px;background:${ORANGE}"></td></tr>

  <tr><td style="padding:26px 30px 0">
    <div style="font-size:22px;font-weight:800;letter-spacing:.14em;color:${INK};line-height:1">FIDATO</div>
    <div style="font-size:10px;letter-spacing:.42em;color:${ORANGE};font-weight:700;margin-top:3px">HOTELS</div>
  </td></tr>

  <tr><td style="padding:22px 30px 0">
    <p style="margin:0 0 14px;font-size:15px;color:${INK}">Dear ${escape(v.guestName)},</p>
    <p style="margin:0 0 14px;font-size:14px;color:${INK};line-height:1.6">
      Greetings from ${escape(v.org.brandName)}.
    </p>
    <p style="margin:0 0 18px;font-size:14px;color:${INK};line-height:1.6">
      Thank you for choosing us. We are pleased to confirm your booking at
      <strong>${escape(v.hotelName)}</strong>, ${escape(v.hotelCity)}. Your voucher is
      attached — please present it at check in.
    </p>
  </td></tr>

  <tr><td style="padding:0 30px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:6px;background:#fafbfb">
      <tr>
        <td style="padding:14px 16px">
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${INK}">
            <tr>
              <td style="padding:3px 0;color:${GREY}">Reference</td>
              <td style="padding:3px 0;text-align:right;font-weight:700">${escape(v.reference)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:${GREY}">Check in</td>
              <td style="padding:3px 0;text-align:right;font-weight:700">${escape(v.checkIn)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:${GREY}">Check out</td>
              <td style="padding:3px 0;text-align:right;font-weight:700">${escape(v.checkOut)}</td>
            </tr>
            <tr>
              <td style="padding:3px 0;color:${GREY}">Rooms &middot; nights</td>
              <td style="padding:3px 0;text-align:right;font-weight:700">${v.totalRooms} &middot; ${v.nights}</td>
            </tr>
            ${
              v.hotelConfirmationNumber
                ? `<tr>
                     <td style="padding:3px 0;color:${GREY}">Hotel reference</td>
                     <td style="padding:3px 0;text-align:right;font-weight:700">${escape(v.hotelConfirmationNumber)}</td>
                   </tr>`
                : ""
            }
            <tr><td colspan="2" style="padding-top:8px;border-top:1px solid ${LINE}"></td></tr>
            <tr>
              <td style="padding:3px 0;font-weight:700">Total (${escape(v.paymentTerm)})</td>
              <td style="padding:3px 0;text-align:right;font-weight:800;font-size:15px">${money(v.totalAmount)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:20px 30px 26px">
    <p style="margin:0 0 4px;font-size:14px;color:${INK}">With warm regards,</p>
    <p style="margin:0;font-size:14px;color:${INK};font-weight:700">Reservations</p>
    <p style="margin:2px 0 0;font-size:13px;color:${GREY}">${escape(v.org.brandName)}</p>
  </td></tr>

  <tr><td style="padding:16px 30px;background:#fafbfb;border-top:1px solid ${LINE}">
    <div style="font-size:11px;color:${GREY};line-height:1.6">
      ${escape(v.org.address)}<br>
      ${escape(v.org.phone)} &nbsp;&middot;&nbsp; ${escape(v.org.email)} &nbsp;&middot;&nbsp; ${escape(v.org.website)}
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  return { subject, html, text };
}
