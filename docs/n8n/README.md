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

## The PDF

**The PDF arrives already built.** `voucher.pdfBase64` is a real,
vector-text PDF — about 18 KB, one page, selectable and searchable —
generated in the browser at booking time. n8n needs no converter, no
rendering service and no container.

That matters most for WhatsApp, which cannot send an HTML file at all;
it needs a document. The same bytes go to the email attachment, Drive
and WhatsApp, so all three match what the salesperson previewed.

**Turning it into a binary in n8n.** One *Convert to File* node
(operation: **Convert to binary / base64 to file**) pointed at
`voucher.pdfBase64`, with the file name from `voucher.filename` and
mime type `application/pdf`. Everything downstream — Gmail's
*Attachments*, Drive's *Upload*, WhatsApp's *Document* — takes that
binary directly.

**Gmail attachment**: set *Attachments → Binary Property* to the field
the Convert to File node produced (`data` by default).

**Fallback.** If PDF generation fails the field is an empty string and
`voucher.html` is still there. Worth an IF node if you want belt and
braces; the email body itself is already the full voucher either way,
so an absent attachment is a degraded email, not a broken one.

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
