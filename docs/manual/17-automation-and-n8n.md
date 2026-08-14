# Volume XVII — Automation and n8n

How a booking becomes a voucher in a guest's inbox, a file in Drive and a message on WhatsApp —
without the application ever holding a credential for any of them.

---

## 17.1 The rule

```
React UI → repository layer → Firestore → automationQueue → n8n → the outside world
```

**The React app never talks to Drive, WhatsApp, email, AI, accounting or marketing.**

This is not a preference. Spark has no server, so anything the app can do, it does in a browser
with code the user can read. A Drive credential in the bundle is a published Drive credential.
The app writes a row to `automationQueue` and posts a webhook; n8n holds every secret and makes
every outbound call.

Anything that appears to break this rule is a defect. It is Constraint 2.

---

## 17.2 The two records, and why there are two

Creating a reservation produces **two** independent records of the same intent:

| Record | Where | Purpose | Written by |
|---|---|---|---|
| The queue row | `automationQueue/{id}` | The durable record that this event happened | The app, always |
| The webhook POST | n8n's endpoint | The optimistic fast path | The app, fire and forget |

```
reservationsRepo.create(...)
  ├─ runTransaction  → the booking and its roll-ups
  ├─ recordAudit
  └─ void pushToN8n("reservation.created", …)
       ├─ setDoc(automationQueue/{id})    ← durable
       ├─ fetch(webhook.url)              ← optimistic
       └─ .then(outcome => updateDoc(reservation, { automation: outcome }))
```

⚠️ **`pushToN8n` is deliberately not awaited.** A booking must not fail because a webhook is
slow or an n8n instance is down. The guest's reservation is the thing that matters; delivery is
a consequence of it.

⚠️ **Which means a successful save says nothing about delivery.** That is why the outcome is
written back onto the reservation and rendered as a visible status, rather than assumed.

---

## 17.3 The payload: two bodies

The webhook carries two objects, and they are not interchangeable.

| Body | Holds | Consumed by |
|---|---|---|
| `data.voucher` | The rendered voucher — everything a guest should see | Email, Drive, WhatsApp |
| `data.reservation` | The booking record — everything the business stores | The register insert |

They were separated after an attempt to serve both from one shape. A voucher is a document
addressed to a guest; a reservation is a row addressed to a database. Fields that belong in one
are wrong in the other — internal notes, owner ids, roll-up counters — and merging them meant
either leaking internals onto a guest's document or omitting fields the register needs.

---

## 17.4 The voucher

Three renderings of one source, in `src/features/reservations/`.

| Rendering | File | Used for |
|---|---|---|
| HTML | `voucher.ts` — `renderVoucherHtml` | On-screen preview, and the email body |
| PDF | `voucherPdf.ts` — jsPDF, vector | Download, WhatsApp, Drive |
| Sample | `voucherSample.ts` | Tests and the "Send test" button |

### What the outside world forced

**Gmail strips `<svg>` and blocks `data:` URIs.** The inline SVG logo — perfect on screen —
vanished in email. The email uses a PNG hosted on `fidatohotels.com`, served from the sending
domain so it is not treated as a remote tracking pixel.

**The email is the voucher, not a covering note.** A plain-text mail with an attachment reads as
a system notification. The body is the branded document.

⚠️ **jsPDF's built-in fonts are WinAnsi only.** `₹`, en dashes and middots are not
representable. `ascii()` strips them at render, because a blank box on a document about money
reads as a fault in the business, not in the font. Currency is written as `INR`.

**Bank details print only when both an account name and a number are present.** A bare IFSC, or
an account number with nobody to pay, is worse than no bank block — a guest may attempt a
transfer against it. IFSC is uppercased at render as well as at entry, because the form only
protects what the form wrote.

**A QR code** links to the Fidato site, generated at render.

### The rejected approaches

| Attempt | Why it failed |
|---|---|
| HTML voucher in the email body only | No attachment to keep; the logo stripped |
| Gotenberg container rendering HTML → PDF | The n8n host had no Docker access |
| Base64 PDF over the webhook | Payload size, and n8n handled it poorly |
| n8n rendering the PDF from HTML | Added a rendering dependency for a document the app can already draw |

**What settled:** the app draws the PDF as vectors — 18 kB, one page, about 270 ms — and n8n
receives it ready to send.

---

## 17.5 Delivery

### Email

From `crs@fidatohotels.com`, over SMTP on the company domain.

⚠️ **Deliverability is a DNS problem, not a code problem.** Until SPF, DKIM and DMARC exist for
`fidatohotels.com` and align with the sender, vouchers land in spam. No amount of work in this
repository changes that.

### Google Drive

A copy of every voucher, filed automatically.

### WhatsApp — Meta Cloud API

An approved utility template, with the PDF **uploaded to obtain a media id** rather than linked.

⚠️ **Uploading avoids publishing.** A link would require the voucher to sit at a public URL —
a guest's name, itinerary and the property's bank details, reachable by anyone with the address.

⚠️ **Named and positional template parameters are not interchangeable.** A template approved
with named parameters rejects positional ones and vice versa; the error is not obvious.

Interakt was implemented first and superseded when the Meta app and its approved template became
available. The Interakt workflow remains in `docs/n8n/` as a fallback.

### The register insert

An HTTP node writes the reservation into the booking register's Supabase project.

⚠️ **It uses HTTP, not the Supabase node.** The Supabase node depended on n8n *Variables*, which
is a licensed feature and simply undefined on the community edition — expressions referencing
`$vars` evaluated to nothing and the node failed with no useful message.

⚠️ **The credential must hold the `service_role` key.** With the publishable key the insert is
refused by RLS with error 42501. This is currently outstanding.

---

## 17.6 Failure, and making it visible

Automation that fails silently is worse than none, because the booking looks complete and the
guest has nothing.

### On the reservation

Every reservation carries the outcome of its push:

```json
{ "status": "sent", "detail": "Delivered", "withPdf": true,
  "at": "2026-08-14T10:02:04.405Z", "durationMs": 670 }
```

### The health banner

`AutomationHealthBanner` counts **recent bookings that did not reach n8n**.

⚠️ **Counted from reservations, not from the queue.** The queue is readable only by Owner and
Admin, so a count taken from there would be blank for the salesperson who made the booking —
the one person who needs to know their guest was never emailed.

It is silent when everything is fine. A banner that is always on screen stops being read.

### The switched-off webhook

The webhook can be configured and disabled at once, and that state produced a memorable waste:
bookings queued correctly, nothing sent, and n8n showed no executions at all.

⚠️ **Worse, "Send test" hardcoded `enabled: true`.** The test passed, proving nothing about the
path real bookings take. A standing banner now reports a configured-but-disabled webhook, and
the test result says explicitly that it does not reflect live behaviour.

---

## 17.7 The gap that remains

⚠️ **Nothing ever writes back to an `automationQueue` row.**

Observed before the launch wipe: six rows at `pending` with `attempts: 0`, while all three
reservations recorded `automation: sent · Delivered`. **Delivery genuinely worked.** The queue is
simply write-only from the application's side, and the n8n workflow does not close the rows
either.

The consequence is a contradiction between two screens:

| Screen | Reports |
|---|---|
| Reservations | Delivered |
| Automation → Run history | 0% success, pending count only grows |

`AutomationHealthBanner` is unaffected, because it counts reservations rather than the queue —
a decision made for a different reason that happens to save it here.

**The fix is one line.** `pushToN8n` already knows the outcome and writes it to the reservation;
it could write it to the queue row too. Or n8n could close the row it consumed. It is untouched
because it decides *who owns the queue's lifecycle*, and that is a design question rather than a
bug fix.

---

## 17.8 Workflow files

In `docs/n8n/`. Import from file; credentials are never in the JSON.

| File | Path |
|---|---|
| `fidato-reservation-meta.json` | The current workflow — 10 nodes, Meta Cloud API, HTTP register insert |
| Earlier variants | Interakt, SMTP-only, and no-converter versions retained as fallbacks |

⚠️ **Nodes must not reference other nodes by name.** `$('Reservation confirmed')` breaks the
moment anyone renames the trigger, with the error *"Referenced node doesn't exist"*. The Code
nodes resolve their input by walking the incoming items and falling back through candidate
names.

⚠️ **`$vars` is a licensed feature.** On the community edition it is undefined, and expressions
using it fail quietly. Values it once held are now literals or credentials.

---

Next: [Volume XVIII — The booking register](18-booking-register.md)
