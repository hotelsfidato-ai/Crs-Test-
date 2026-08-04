# n8n — reservation confirmed

What happens when someone saves a booking in Fidato CRS: the guest is
emailed a voucher, a copy is filed in Drive, and a short WhatsApp goes
out. n8n does all three; the CRS only announces the event.

## What the CRS sends

One `POST` per confirmed reservation, to the URL you paste into
**Admin → Integrations**. The body:

```jsonc
{
  "event": "reservation.created",
  "sentAt": "2026-08-04T09:05:00.000Z",
  "source": "fidato-crs",
  "eventId": "<automationQueue document id>",
  "data": {
    "to": "guest@example.com",          // where the email goes
    "guestPhone": "+9182177...",        // where the WhatsApp goes
    "email": {
      "subject": "Booking confirmed — ...",
      "html":    "<!doctype html>...",  // send this as the body
      "text":    "Dear ..."             // plain-text alternative
    },
    "voucher": {
      "reference":   "FH-2026-00042",
      "pdfBase64":   "JVBERi0xLjMK...",  // ← the actual PDF, ~18 KB
      "pdfMimeType": "application/pdf",
      "filename":    "Voucher-FH-2026-00042.pdf",
      "html":        "<!doctype html>...", // fallback if the PDF failed
      "model":       { /* every field, already formatted */ }
    },
    "reservation": { }, "customer": { }, "company": { }, "hotel": { }
  }
}
```

**The voucher arrives already rendered.** Do not rebuild it in n8n. The
CRS renders it once so the guest's copy cannot drift from the folio —
a second implementation here would disagree the first time a rate or a
policy changed. Use `email.html` as the message body and
`voucher.html` as the document.

## Importing

1. n8n → **Workflows → Import from file** →
   `fidato-reservation-workflow.json`.
2. Open each node marked `REPLACE_ME` and attach your own credential:
   **Gmail**, **Google Drive**, **WhatsApp**.
3. In **WhatsApp the guest**, set `phoneNumberId` to the Phone Number ID
   from Meta → WhatsApp → API Setup.
4. **Activate** the workflow, copy the *Production* webhook URL, and
   paste it into Fidato → **Admin → Integrations** → *Send test* → *Save*.

## Two things that will bite you

**CORS.** The POST comes from a browser, not a server — Firebase Spark
has no backend to send it from. Because it carries
`Content-Type: application/json`, the browser sends a preflight
`OPTIONS` first. The Webhook node's **Allowed Origins (CORS)** is set to
`*` in the import; if you clear it, every push fails with an opaque
"could not reach the endpoint" and the URL will look wrong when it
isn't.

**Use the Production URL, not the Test one.** The Test URL only listens
while you have the editor open with *Listen for test event* running. A
saved booking on a Monday morning will go nowhere.

## The PDF — n8n renders it

`voucher.html` is the master template. n8n converts it once and feeds
the result to Drive, WhatsApp and the Gmail attachment:

```
Pick voucher HTML → HTML to file → HTML to PDF ─┬─ Gmail (attachment)
                                                 ├─ Drive
                                                 └─ WhatsApp
```

One renderer, one template: change the voucher and every copy follows.

**⚠️ Two different documents, and mixing them up breaks the email.**

| Field | Use it for | Never use it for |
|---|---|---|
| `email.html` | the Gmail **body** | the PDF |
| `voucher.html` | the **PDF** | the Gmail body |

`voucher.html` is an A4 print sheet — a `<style>` block, `@page` rules,
fixed `210mm` widths. Gmail discards `<style>` outright and Outlook
renders through Word, so as an email body it arrives as a broken
column. `email.html` is table-based with inline styles for exactly that
reason. They carry the same figures from the same VoucherModel.

**The converter.** The workflow posts to Gotenberg at
`http://gotenberg:3000/forms/chromium/convert/html` — change that URL
to yours. Self-hosting it is one container:

```bash
docker run -d --name gotenberg -p 3000:3000 gotenberg/gotenberg:8
```

`preferCssPageSize=true` and `printBackground=true` are already set, so
the sheet's own `@page` rules drive the page size and the orange rules
and panels actually print. Browserless, PDFShift and CloudConvert work
the same way — swap the URL and the body parameters.

**If you have no converter**, tick *"Also attach a ready-made PDF"* in
Admin → Integrations. The push then carries `voucher.pdfBase64` and you
can drop the two conversion nodes, using *Convert to File* in
`toBinary` mode instead. The trade is a second renderer whose output is
not pixel-identical to the sheet, plus ~24 KB per booking — which is
why it is off by default.

## Known limit — worth understanding before you rely on it

The push is **best-effort**, and only the push carries the rendered
voucher. If the browser tab closes mid-flight or the network drops, the
booking is still saved and an event still lands in `automationQueue`,
but **that queued event does not contain the voucher HTML** — so a
workflow that polls the queue instead of receiving the push cannot send
the email.

In practice: the email goes out on the push. If a guest reports never
receiving one, re-send it from the reservation's **Voucher** button
rather than expecting n8n to have caught up. Closing this properly needs
a server-side sender, which means leaving the Spark plan.
