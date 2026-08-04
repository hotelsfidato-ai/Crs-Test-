import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { FIDATO_LOGO_PNG } from "@/assets/brand/logoPng";
import type { VoucherModel } from "./voucher";

/* ══════════════════════════════════════════════════════════════════
   THE VOUCHER AS A REAL PDF

   ⚠️ Drawn, not screenshotted. The obvious route — html2canvas over
   the existing HTML — rasterises everything: text stops being
   selectable, stops being searchable, goes soft on a phone screen, and
   a one-page voucher lands at 1-3 MB. WhatsApp and Gmail both care
   about that. Drawing the layout with vector text keeps it sharp at
   any zoom and lands around 40-60 KB.

   ⚠️ The cost is that this layout is maintained SEPARATELY from
   renderVoucherHtml. There is no shortcut that produces a real
   vector PDF from that markup in the browser. When one changes, change
   the other — the figures come from the same VoucherModel, so they
   cannot disagree on numbers, only on arrangement.

   ⚠️ WinAnsi only. jsPDF's built-in Helvetica cannot encode the rupee
   sign, en dashes or middot, and silently substitutes junk. Everything
   here goes through `ascii()`. Money is already rendered as "INR n" by
   the voucher model for exactly this reason.
   ══════════════════════════════════════════════════════════════════ */

const INK = "#142B3A";
const ORANGE = "#FE611F";
const GREY = "#67737E";
const LINE = "#DFE3E6";
const WASH = "#FAFBFB";
const PEACH = "#FFF6F1";

/* A4 in mm, with the margin the printed sheet uses. */
const W = 210;
const M = 13;
const RIGHT = W - M;
const CONTENT = W - M * 2;

/**
 * Strips anything Helvetica's WinAnsi encoding cannot represent.
 * Without this a rupee sign or an em dash prints as a black lozenge.
 */
function ascii(value: unknown): string {
  return String(value ?? "")
    .replace(/[—–]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/₹/g, "INR ")
    .replace(/[^\x20-\x7E]/g, "");
}

interface Ctx {
  doc: jsPDF;
  y: number;
}

const setFill = (doc: jsPDF, hex: string) => doc.setFillColor(hex);
const setDraw = (doc: jsPDF, hex: string) => doc.setDrawColor(hex);

function text(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    color?: string;
    bold?: boolean;
    align?: "left" | "center" | "right";
    maxWidth?: number;
  } = {},
) {
  const { size = 9, color = INK, bold = false, align = "left", maxWidth } = opts;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(color);
  const safe = ascii(value);
  if (maxWidth) {
    const lines = doc.splitTextToSize(safe, maxWidth);
    doc.text(lines, x, y, { align });
    return lines.length;
  }
  doc.text(safe, x, y, { align });
  return 1;
}

/** Small uppercase caption used above every value in the sheet. */
function label(doc: jsPDF, value: string, x: number, y: number, align: "left" | "right" = "left") {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(GREY);
  doc.text(ascii(value).toUpperCase(), x, y, { align, charSpace: 0.3 });
}

/** A bordered strip of equally spaced label/value cells. */
function strip(
  ctx: Ctx,
  cells: { label: string; value: string; hint?: string; align?: "left" | "right" }[],
  height = 15,
) {
  const { doc } = ctx;
  setFill(doc, WASH);
  setDraw(doc, LINE);
  doc.setLineWidth(0.2);
  doc.rect(M, ctx.y, CONTENT, height, "FD");

  const colWidth = CONTENT / cells.length;
  cells.forEach((cell, i) => {
    const left = M + colWidth * i;
    if (i > 0) {
      doc.line(left, ctx.y, left, ctx.y + height);
    }
    const align = cell.align ?? "left";
    const x = align === "right" ? left + colWidth - 4 : left + 4;
    label(doc, cell.label, x, ctx.y + 5, align);
    text(doc, cell.value, x, ctx.y + 9.6, { size: 9.5, bold: true, align });
    if (cell.hint) {
      text(doc, cell.hint, x, ctx.y + 13, { size: 6.6, color: GREY, align });
    }
  });
  ctx.y += height;
}

export interface VoucherPdfOptions {
  /** Where the QR code points. Falls back to the org website. */
  qrUrl?: string;
  /** Caption under the QR — "Follow us", "Book direct", whatever it is. */
  qrCaption?: string;
}

/**
 * Builds the voucher. Async only because the QR code is rendered to a
 * data URL first.
 */
export async function buildVoucherPdf(
  v: VoucherModel,
  options: VoucherPdfOptions = {},
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({
    title: `Reservation voucher ${ascii(v.reference)}`,
    subject: `${ascii(v.hotelName)} - ${ascii(v.checkIn)}`,
    author: ascii(v.org.brandName),
    creator: ascii(v.org.brandName),
  });

  const ctx: Ctx = { doc, y: M };

  /* ── Masthead ───────────────────────────────────────────────── */
  // 440x124 native; 46mm wide keeps the proportions exactly.
  doc.addImage(FIDATO_LOGO_PNG, "PNG", M, ctx.y, 46, 12.96);

  text(doc, "RESERVATION VOUCHER", RIGHT, ctx.y + 5.5, {
    size: 11, bold: true, align: "right",
  });
  text(doc, v.reference, RIGHT, ctx.y + 10.5, { size: 9, color: GREY, align: "right" });

  ctx.y += 16;
  setFill(doc, ORANGE);
  doc.rect(M, ctx.y, CONTENT, 1.1, "F");
  ctx.y += 5;

  /* ── Status ─────────────────────────────────────────────────── */
  strip(ctx, [
    { label: "Booked on", value: v.bookedOn },
    { label: "Status", value: v.status.replace(/_/g, " ").toUpperCase() },
    { label: "Payment", value: v.paymentTermCode, hint: v.paymentTerm },
    { label: "Total", value: v.totalAmount ? money(v.totalAmount) : "-", align: "right" },
  ]);
  ctx.y += 6;

  /* ── Hotel and guest ────────────────────────────────────────── */
  const colW = CONTENT / 2;
  const top = ctx.y;

  label(doc, "Hotel", M, ctx.y);
  ctx.y += 5;
  text(doc, v.hotelName, M, ctx.y, { size: 11.5, bold: true, maxWidth: colW - 6 });
  ctx.y += 4.6;
  const addrLines = text(doc, v.hotelAddress, M, ctx.y, {
    size: 8, color: GREY, maxWidth: colW - 8,
  });
  ctx.y += addrLines * 3.6 + 1.5;

  for (const [k, val] of [
    ["Phone", v.hotelPhone],
    ["Email", v.hotelEmail],
    ["Contact", v.hotelContactPerson],
  ] as const) {
    if (!val) continue;
    text(doc, k, M, ctx.y, { size: 7.6, color: GREY });
    text(doc, val, M + 17, ctx.y, { size: 7.6, bold: true, maxWidth: colW - 24 });
    ctx.y += 4;
  }

  const hotelBottom = ctx.y;

  // Guest column
  const gx = M + colW + 5;
  ctx.y = top;
  setDraw(doc, LINE);
  doc.setLineWidth(0.2);

  label(doc, "Guest", gx, ctx.y);
  ctx.y += 5;
  text(doc, v.guestName, gx, ctx.y, { size: 11.5, bold: true, maxWidth: colW - 10 });
  ctx.y += 4.6;
  if (v.companyName) {
    text(doc, v.companyName, gx, ctx.y, { size: 8, color: GREY, maxWidth: colW - 10 });
    ctx.y += 4.6;
  }
  for (const [k, val] of [
    ["Email", v.guestEmail],
    ["Phone", v.guestPhone],
    ["Booked by", v.bookedByName],
  ] as const) {
    if (!val) continue;
    text(doc, k, gx, ctx.y, { size: 7.6, color: GREY });
    text(doc, val, gx + 19, ctx.y, { size: 7.6, bold: true, maxWidth: colW - 26 });
    ctx.y += 4;
  }

  // Divider between the two columns, sized to the taller one.
  const guestBottom = ctx.y;
  const bottom = Math.max(hotelBottom, guestBottom);
  doc.line(M + colW, top - 3, M + colW, bottom - 2);
  ctx.y = bottom + 3;

  /* ── Stay ───────────────────────────────────────────────────── */
  strip(ctx, [
    { label: "Check in", value: v.checkIn, hint: "From 14:00" },
    { label: "Check out", value: v.checkOut, hint: "By 11:00" },
    { label: "Nights", value: String(v.nights) },
    {
      label: "Guests",
      value: `${v.totalRooms} room${v.totalRooms === 1 ? "" : "s"}`,
      hint: `${v.totalAdults} adult${v.totalAdults === 1 ? "" : "s"}${
        v.totalChildren ? `, ${v.totalChildren} child` : ""
      }`,
    },
  ]);
  ctx.y += 7;

  /* ── Rooms ──────────────────────────────────────────────────── */
  label(doc, "Rooms and rates", M, ctx.y);
  ctx.y += 3;

  const cQty = M + CONTENT - 62;
  const cRate = M + CONTENT - 34;
  const cAmt = RIGHT;

  setDraw(doc, INK);
  doc.setLineWidth(0.4);
  doc.line(M, ctx.y, RIGHT, ctx.y);
  ctx.y += 3.4;
  label(doc, "Room", M, ctx.y);
  label(doc, "Qty", cQty, ctx.y);
  label(doc, "Per night", cRate, ctx.y, "right");
  label(doc, "Amount", cAmt, ctx.y, "right");
  ctx.y += 2.4;

  for (const room of v.rooms) {
    setDraw(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(M, ctx.y, RIGHT, ctx.y);
    ctx.y += 4.4;

    text(doc, `Room ${room.index} - ${room.roomType}`, M, ctx.y, {
      size: 8.6, bold: true, maxWidth: cQty - M - 6,
    });
    text(doc, String(room.quantity), cQty, ctx.y, { size: 8.6 });
    text(doc, money(room.ratePerNight), cRate, ctx.y, { size: 8.6, align: "right" });
    text(doc, money(room.lineTotal), cAmt, ctx.y, { size: 8.6, bold: true, align: "right" });
    ctx.y += 3.6;

    text(doc, `${room.mealPlan} - ${room.mealPlanFull}`, M, ctx.y, {
      size: 7, color: GREY, maxWidth: cQty - M - 6,
    });
    ctx.y += 3.2;
    if (room.extras) {
      text(doc, room.extras, M, ctx.y, { size: 7, color: GREY, maxWidth: cQty - M - 6 });
      ctx.y += 3.2;
    }
    ctx.y += 0.8;
  }

  setDraw(doc, LINE);
  doc.setLineWidth(0.2);
  doc.line(M, ctx.y, RIGHT, ctx.y);
  ctx.y += 5;

  /* ── Totals, right aligned ──────────────────────────────────── */
  const totalsLeft = M + CONTENT - 62;
  const totalsTop = ctx.y;

  const totalRow = (l: string, val: string, bold = false) => {
    text(doc, l, totalsLeft, ctx.y, { size: bold ? 9 : 8, color: bold ? INK : GREY, bold });
    text(doc, val, RIGHT, ctx.y, { size: bold ? 11 : 8, bold: true, align: "right" });
    ctx.y += bold ? 5 : 4.2;
  };

  totalRow("Room charges", money(v.roomCharges));
  if (v.discountAmount > 0) totalRow("Discount", `- ${money(v.discountAmount)}`);
  totalRow(`GST (${Math.round(v.gstRate * 100)}%)`, money(v.taxAmount));
  setDraw(doc, INK);
  doc.setLineWidth(0.4);
  doc.line(totalsLeft, ctx.y - 1, RIGHT, ctx.y - 1);
  ctx.y += 3.4;
  totalRow("Grand total", money(v.totalAmount), true);

  /* Special requests sit beside the totals rather than below, which is
     what keeps the whole voucher on one page. */
  if (v.specialRequests) {
    let sy = totalsTop;
    label(doc, "Special requests", M, sy);
    sy += 4;
    text(doc, v.specialRequests, M, sy, {
      size: 7.6, color: INK, maxWidth: totalsLeft - M - 8,
    });
  }

  ctx.y = Math.max(ctx.y, totalsTop + 22) + 3;

  /* ── The hotel's own confirmation ───────────────────────────── */
  if (v.hotelConfirmationNumber || v.hotelRepName || v.confirmedAt) {
    const h = 17;
    setFill(doc, PEACH);
    setDraw(doc, LINE);
    doc.setLineWidth(0.2);
    doc.rect(M, ctx.y, CONTENT, h, "FD");
    setFill(doc, ORANGE);
    doc.rect(M, ctx.y, 1.3, h, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(ORANGE);
    doc.text("CONFIRMED BY THE HOTEL", M + 5, ctx.y + 5, { charSpace: 0.3 });

    const items = [
      v.hotelConfirmationNumber && ["Confirmation number", v.hotelConfirmationNumber],
      v.hotelRepName && ["Confirmed by", v.hotelRepName],
      v.confirmedAt && ["Confirmed at", v.confirmedAt],
    ].filter(Boolean) as [string, string][];

    const iw = (CONTENT - 10) / items.length;
    items.forEach(([k, val], i) => {
      const x = M + 5 + iw * i;
      text(doc, k, x, ctx.y + 9.5, { size: 6.6, color: GREY });
      text(doc, val, x, ctx.y + 13.8, { size: 9, bold: true, maxWidth: iw - 4 });
    });
    ctx.y += h + 5;
  }

  /* ── Bank details ───────────────────────────────────────────── */
  if (v.bank) {
    const lines: [string, string][] = [
      ["Account name", v.bank.accountName],
      ["Account no.", v.bank.accountNumber],
      ["Bank", v.bank.bankName],
      ["Branch", v.bank.branch],
      ["IFSC", v.bank.ifsc],
    ];
    const shown = lines.filter(([, val]) => val);
    const h = 8 + shown.length * 4.4;

    setDraw(doc, LINE);
    doc.setLineWidth(0.2);
    doc.rect(M, ctx.y, CONTENT, h, "D");

    label(doc, "Bank details", M + 5, ctx.y + 5);
    let by = ctx.y + 9.6;
    for (const [k, val] of shown) {
      text(doc, k, M + 5, by, { size: 7.6, color: GREY });
      /* Courier for the figures. An account number or IFSC is
         transcribed by hand into a banking app, and a monospaced face
         is the difference between a clean transfer and a failed one. */
      doc.setFont("courier", "bold");
      doc.setFontSize(8.4);
      doc.setTextColor(INK);
      doc.text(ascii(val), M + 32, by);
      by += 4.4;
    }
    ctx.y += h + 5;
  }

  /* ── QR + policies ──────────────────────────────────────────── */
  const qrTarget = options.qrUrl || `https://${v.org.website.replace(/^https?:\/\//, "")}`;
  const qrTop = ctx.y;

  try {
    const qr = await QRCode.toDataURL(qrTarget, {
      margin: 0,
      width: 320,
      color: { dark: INK, light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });
    const qrSize = 22;
    const qrX = RIGHT - qrSize;
    doc.addImage(qr, "PNG", qrX, qrTop, qrSize, qrSize);
    text(doc, options.qrCaption || "Follow us", qrX + qrSize / 2, qrTop + qrSize + 3.4, {
      size: 6.6, color: GREY, align: "center",
    });
    text(doc, "Scan to connect", qrX + qrSize / 2, qrTop + qrSize + 6.6, {
      size: 6.6, color: GREY, align: "center",
    });
  } catch {
    /* A QR is decoration on a document that must still be valid without
       it. Never let it take the voucher down. */
  }

  label(doc, "Hotel policies", M, ctx.y);
  ctx.y += 4;
  const policies = [
    "Guests must present government photo identity at check in - driving licence, voter ID, Aadhaar or passport.",
    "A valid credit card may be required to guarantee incidental charges.",
    "Special requests are subject to availability at check in.",
    "Please share your company GST number at check in if the stay is billed to a company.",
  ];
  policies.forEach((p, i) => {
    const lines = text(doc, `${i + 1}.  ${p}`, M, ctx.y, {
      size: 7, color: GREY, maxWidth: CONTENT - 32,
    });
    ctx.y += lines * 3.1 + 1.1;
  });

  ctx.y = Math.max(ctx.y, qrTop + 32) + 3;

  /* ── Footer ─────────────────────────────────────────────────── */
  setDraw(doc, INK);
  doc.setLineWidth(0.4);
  doc.line(M, ctx.y, RIGHT, ctx.y);
  ctx.y += 4.5;

  text(doc, v.org.brandName.toUpperCase(), M, ctx.y, { size: 8, bold: true });
  if (v.org.address) {
    text(doc, v.org.address, M, ctx.y + 4, { size: 7, color: GREY, maxWidth: CONTENT / 2 - 6 });
  }

  let fy = ctx.y;
  for (const line of [v.org.phone, v.org.email, v.org.website, v.org.gstin ? `GSTIN ${v.org.gstin}` : ""]) {
    if (!line) continue;
    text(doc, line, RIGHT, fy, { size: 7, color: GREY, align: "right" });
    fy += 3.4;
  }

  text(
    doc,
    "This voucher confirms the booking described above. Please present it at check in.",
    W / 2,
    Math.max(ctx.y + 12, fy + 4),
    { size: 6.6, color: GREY, align: "center" },
  );

  return doc;
}

/** `INR 1,16,216` — Indian digit grouping, WinAnsi safe. */
function money(n: number): string {
  return `INR ${Math.round(n || 0).toLocaleString("en-IN")}`;
}

export async function voucherPdfBlob(
  v: VoucherModel,
  options?: VoucherPdfOptions,
): Promise<Blob> {
  const doc = await buildVoucherPdf(v, options);
  return doc.output("blob");
}

/**
 * Base64 WITHOUT the data: prefix — the shape n8n's "Convert to File"
 * and the Gmail/Drive/WhatsApp nodes expect for a binary attachment.
 */
export async function voucherPdfBase64(
  v: VoucherModel,
  options?: VoucherPdfOptions,
): Promise<string> {
  const doc = await buildVoucherPdf(v, options);
  const uri = doc.output("datauristring");
  return uri.slice(uri.indexOf(",") + 1);
}

export function voucherPdfFilename(v: VoucherModel): string {
  return `Voucher-${ascii(v.reference).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

/**
 * Where the QR points, from settings, with the website as the fallback.
 *
 * ⚠️ Shared by the download, the preview and the copy n8n sends, so a
 * guest scanning the printed sheet and a guest scanning the emailed one
 * cannot land in different places.
 */
export function qrOptions(
  org?: { socialUrl?: string; socialCaption?: string } | null,
): VoucherPdfOptions {
  const url = org?.socialUrl?.trim();
  return {
    qrUrl: url || undefined,
    qrCaption: org?.socialCaption?.trim() || (url ? "Follow us" : "Visit us"),
  };
}
