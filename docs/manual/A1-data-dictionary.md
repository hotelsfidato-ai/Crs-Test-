← [Index](README.md) · Related: [VI — Data model](06-data-model.md)

---

# Appendix A — Complete data dictionary

Every field of every collection. Volume VI explains the *design*; this is the reference.

**Legend** — `R` required · `O` optional · `D` denormalised copy of another document's field ·
`↑` roll-up maintained by writes · `🔒` immutable after creation

---

## A.1 `Auditable` — mixed into 15 collections

| Field | Type | | Notes |
|---|---|---|---|
| `createdAt` | `IsoDateTime` | R 🔒 | |
| `createdBy` | `string` | R 🔒 | User id |
| `updatedAt` | `IsoDateTime` | R | Set on every write |
| `updatedBy` | `string` | R | User id |

---

## A.2 `hotels` — 32 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | `htl-{city}-{slug}` |
| `name` | `string` | R | Full property name |
| `shortName` | `string` | R | For tables and chips |
| `city` | `string` | R | Also used as the grouping key in the occupancy report |
| `state` | `string` | R | |
| `address` | `string` | R | |
| `category` | `HotelCategory` | R | `business` · `resort` · `heritage` · `beach` · `hill_station` · `banquet` |
| `status` | `HotelStatus` | R | `active` · `onboarding` · `paused`. Paused blocks new bookings |
| `starRating` | `number` | R | 3–5 |
| `totalRooms` | `number` | R | Real. Portfolio range 17–236 |
| `description` | `string` | R | Fact-sheet marketing copy |
| `roomMix` | `string[]` | R | Verbatim, e.g. `"Deluxe Room - 115 Rooms"` |
| `features` | `string[]` | R | |
| `facilities` | `string[]` | R | |
| `amenities` | `string[]` | R | |
| `thingsToDo` | `string[]` | R | Nearby attractions |
| `distances` | `HotelDistance[]` | R | `{ label, km }` |
| `contacts` | `HotelContact[]` | R | `{ name, designation, email, phone }` |
| `managerId` | `string` | O | The pinned hotel-manager user |
| `commissionPercent` | `number` | R | 8–18 |
| `onboardedAt` | `IsoDate` | R | |

**Indexes needed (Phase 2):** `status ASC, name ASC` · `city ASC, name ASC`

---

## A.3 `roomTypes` — ~120 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | |
| `hotelId` | `string` | R 🔒 | **Scoping key** |
| `hotelName` | `string` | R D | |
| `name` | `string` | R | "Deluxe Room" |
| `code` | `string` | R | "DR" — used to build rate-plan codes |
| `description` | `string` | R | |
| `totalRooms` | `number` | R | Caps the wizard's quantity stepper |
| `maxOccupancy` | `number` | R | |
| `baseRate` | `number` | R | Fallback when no rate plan matches |
| `extraAdultRate` | `number` | R | Not yet used by the quote engine |
| `amenities` | `string[]` | R | |
| `sizeSqft` | `number` | R | |

---

## A.4 `ratePlans` — ~370 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | |
| `hotelId` / `hotelName` | `string` | R / R D | |
| `roomTypeId` / `roomTypeName` | `string` | R / R D | |
| `name` | `string` | R | "Full Board — Shoulder Season" |
| `code` | `string` | R | "DR-AP" |
| `mealPlan` | `MealPlan` | R | `EP` · `CP` · `MAP` · `AP` |
| `rate` | `number` | R | Per room per night, before tax |
| `validFrom` / `validTo` | `IsoDate` | R | The season window |
| `minNights` | `number` | R | Not yet enforced by the wizard |
| `cancellationPolicy` | `string` | R | Editable in the rate dialog |
| `isActive` | `boolean` | R | |

⚠️ `minNights` is stored and displayed but **not enforced**. Recorded as a Phase 2 item.

---

## A.5 `inventory` — derived, not stored

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R | `inv-{roomTypeId}-{date}` |
| `hotelId` / `roomTypeId` | `string` | R | |
| `date` | `IsoDate` | R | |
| `totalRooms` | `number` | R | From the room type |
| `booked` | `number` | R | All channels, not just Fidato |
| `blocked` | `number` | R | Maintenance / holds |
| `available` | `number` | R | `totalRooms − booked − blocked` |
| `rate` | `number` | R | Weekend uplift ×1.15 |

---

## A.6 `companies` — 40 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | `cmp-NNN` |
| `name` | `string` | R | Trading name |
| `legalName` | `string` | R | Appears on invoices |
| `tier` | `CompanyTier` | R | `key_account` · `corporate` · `sme` · `travel_agent` |
| `status` | `CompanyStatus` | R | `active` · `prospect` · `dormant` |
| `industry` | `string` | R | |
| `gstin` | `string` | R | On invoices |
| `city` / `state` / `address` | `string` | R | |
| `website` / `phone` / `email` | `string` | R | |
| **`ownerId`** | `string` | R | **Scoping key (BR-05)** |
| `ownerName` | `string` | R D | |
| `creditLimit` | `number` | R | |
| `creditUsed` | `number` | R ↑ | Drives the utilisation bar |
| `paymentTermDays` | `number` | R | Sets invoice `dueDate` |
| `contractStart` / `contractEnd` | `IsoDate` | O | |
| **`negotiatedDiscountPercent`** | `number` | R | **Applied by the quote engine** |
| `totalReservations` | `number` | R ↑ | |
| `totalRevenue` | `number` | R ↑ | |
| `lastActivityAt` | `IsoDateTime` | R | |
| `notes` | `string` | R | |

---

## A.7 `customers` — 180 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | `cus-NNNN` |
| `firstName` / `lastName` | `string` | R | |
| `fullName` | `string` | R | Stored — the search and sort field |
| **`email`** | `string` | R | **Unique (BR-06)** |
| **`phone`** | `string` | R | **Unique on last 10 digits (BR-06)** |
| `status` | `CustomerStatus` | R | `active` · `lead` · `inactive` |
| `source` | `CustomerSource` | R | 7 values |
| `companyId` / `companyName` | `string` | O / O D | Absent for individuals |
| `designation` | `string` | O | |
| `city` / `state` | `string` | R | |
| **`ownerId`** | `string` | R | **Scoping key** |
| `ownerName` | `string` | R D | |
| `preferences` | `string[]` | R | Shown in the wizard, sent to the property |
| `vip` | `boolean` | R | Property notified before arrival |
| `totalReservations` | `number` | R ↑ | |
| `totalRevenue` | `number` | R ↑ | |
| `lastStayAt` | `IsoDateTime` | O | Set on completion |
| `lastActivityAt` | `IsoDateTime` | R | |
| `notes` | `string` | R | Internal only |

🔧 Phase 2 adds `emailNormalised` and `phoneNormalised` — Volume XIV §14.4.

---

## A.8 `reservations` — 1,100 documents

### Identity

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | `res-NNNN` |
| `reference` | `string` | R 🔒 | `FH-2026-04821` — quoted to guests |
| `status` | `ReservationStatus` | R | 7 values |
| `channel` | `BookingChannel` | R | 6 values |

### Parties — all denormalised

| Field | Type | | |
|---|---|---|---|
| `customerId` / `customerName` | `string` | R / R D | ⚠️ Both updated on merge |
| `companyId` / `companyName` | `string` | O / O D | |
| `hotelId` | `string` | R | **Scoping key** |
| `hotelName` / `hotelCity` | `string` | R D | |
| `ownerId` | `string` | R | **Scoping key** |
| `ownerName` | `string` | R D | |

### Stay

| Field | Type | | Notes |
|---|---|---|---|
| `checkIn` / `checkOut` | `IsoDate` | R | Occupies nights `checkIn` → `checkOut − 1` |
| `nights` | `number` | R | Stored so lists need no computation |
| `rooms` | `ReservationRoom[]` | R | Line items |
| `guests` | `ReservationGuest[]` | R | |
| `totalRooms` / `totalAdults` / `totalChildren` | `number` | R | |

### Money — every component stored

| Field | Type | | Notes |
|---|---|---|---|
| `roomCharges` | `number` | R | Before discount and tax |
| `extrasCharges` | `number` | R | Reserved |
| `discountAmount` | `number` | R | From the company's negotiated rate |
| `taxAmount` | `number` | R | GST at 12% or 18% |
| `totalAmount` | `number` | R | **The approval threshold tests this** |

### Approval and cancellation

| Field | Type | | Notes |
|---|---|---|---|
| `requiresApproval` | `boolean` | R | |
| `approvedBy` / `approvedAt` / `approvalNote` | | O | Written only on `pending_approval → confirmed` |
| `cancelledAt` / `cancelledBy` / `cancellationReason` | | O | Written only on cancellation |

### Notes and links

| Field | Type | | Notes |
|---|---|---|---|
| `specialRequests` | `string` | R | **Sent to the property** |
| `internalNotes` | `string` | R | **Never leaves the platform** |
| `invoiceId` | `string` | O | Set when the invoice is raised |

### `ReservationRoom`

| Field | Type | Notes |
|---|---|---|
| `roomTypeId` / `roomTypeName` | `string` | |
| `ratePlanId` / `ratePlanName` | `string` | |
| `mealPlan` | `MealPlan` | |
| `quantity` | `number` | |
| `ratePerNight` | `number` | 🔒 **Snapshot** — rate changes do not affect existing bookings |
| `adults` / `children` | `number` | Per room |

---

## A.9 `invoices` — ~450 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` / `number` | `string` | R 🔒 | `INV-2607-0193` |
| `status` | `InvoiceStatus` | R | 6 values |
| `reservationId` / `reservationReference` | `string` | R / R D | |
| `customerId` / `customerName` | `string` | R / R D | |
| `companyId` / `companyName` | `string` | O / O D | Billed to the company when present |
| `hotelId` / `hotelName` | `string` | R / R D | |
| `issueDate` | `IsoDate` | R | |
| `dueDate` | `IsoDate` | R | `issueDate + paymentTermDays` |
| `lines` | `InvoiceLine[]` | R 🔒 | Frozen at issue |
| `subtotal` / `taxAmount` / `totalAmount` | `number` | R | |
| `amountPaid` | `number` | R ↑ | |
| `amountDue` | `number` | R ↑ | Stored so it can be filtered |
| `notes` | `string` | R | |

`InvoiceLine`: `description` · `quantity` · `unitPrice` · `amount` · `taxPercent`

---

## A.10 `payments` — ~380 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` / `reference` | `string` | R 🔒 | |
| `invoiceId` / `invoiceNumber` | `string` | R / R D | |
| `customerId` / `customerName` | `string` | R / R D | |
| `amount` | `number` | R | |
| `method` | `PaymentMethod` | R | `bank_transfer` · `upi` · `card` · `cash` · `cheque` |
| `receivedAt` | `IsoDateTime` | R | |
| `reconciled` | `boolean` | R | Matched to a bank statement |
| `note` | `string` | R | |

---

## A.11 `commissions` — ~800 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | |
| `reservationId` / `reservationReference` | `string` | R / R D | |
| `hotelId` / `hotelName` | `string` | R / R D | |
| `ownerId` / `ownerName` | `string` | R / R D | Attribution follows the account |
| `bookingValue` | `number` | R | Gross, including tax |
| `percent` | `number` | R 🔒 | Snapshot of the hotel's rate at accrual |
| `amount` | `number` | R | |
| `status` | `CommissionStatus` | R | `accrued` → `approved` → `paid` |
| `periodMonth` | `string` | R | `"2026-07"` |

---

## A.12 `users` — 24 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | Becomes the Firebase Auth uid |
| `name` / `email` / `phone` | `string` | R | |
| `role` | `Role` | R | Becomes a custom claim |
| `hotelId` / `hotelName` | `string` | O | **Present only for hotel managers** |
| `department` | `string` | R | |
| `isActive` | `boolean` | R | |
| `lastSeenAt` | `IsoDateTime` | R | |
| `avatarColor` | `string` | R | Assigned, not hashed |

---

## A.13 `auditLogs` — ~2,600 documents · append-only

| Field | Type | | Notes |
|---|---|---|---|
| `id` | `string` | R 🔒 | |
| `entityType` | union | R 🔒 | `reservation` · `customer` · `company` · `hotel` · `invoice` · `user` · `rate` |
| `entityId` | `string` | R 🔒 | |
| `entityLabel` | `string` | R 🔒 D | So the log renders without reading the record |
| `action` | `AuditAction` | R 🔒 | 10 values |
| `summary` | `string` | R 🔒 | One line |
| `detail` | `string` | O 🔒 | |
| `actorId` / `actorName` / `actorRole` | | R 🔒 | |
| `at` | `IsoDateTime` | R 🔒 | |

Not `Auditable` — an audit entry that could be updated would defeat its purpose.

---

## A.14 `notifications` and `notificationTemplates`

**`notifications`** — 40 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` / `title` / `body` | `string` | R | |
| `category` | `NotificationCategory` | R | `reservation` · `approval` · `payment` · `system` · `customer` · `automation` |
| `channel` | `NotificationChannel` | R | `in_app` · `email` · `whatsapp` · `sms` · `push` |
| `isRead` | `boolean` | R | |
| `actorName` | `string` | O | |
| `link` | `string` | O | Deep link |
| `at` | `IsoDateTime` | R | |

**`notificationTemplates`** — 12 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` / `name` | `string` | R | |
| `event` | `string` | R | Matches an automation trigger |
| `channel` | `NotificationChannel` | R | |
| `subject` | `string` | R | Email only |
| `body` | `string` | R | Contains `{{tokens}}` |
| `isActive` | `boolean` | R | |
| `variables` | `string[]` | R | Declared tokens |

---

## A.15 `automationWorkflows` and `automationRuns`

**`automationWorkflows`** — 12 documents

| Field | Type | | Notes |
|---|---|---|---|
| `id` / `name` / `description` | `string` | R | |
| `trigger` | `string` | R | Becomes the n8n webhook path |
| `triggerDetail` | `string` | R | |
| `conditions` | `string[]` | R | All must hold |
| `steps` | `AutomationStep[]` | R | Ordered |
| `status` | `AutomationStatus` | R | `active` · `paused` · `draft` |
| `runsLast30Days` | `number` | R | |
| `successRate` | `number` | R | Percentage |
| `averageDurationMs` | `number` | R | |
| `lastRunAt` | `IsoDateTime` | O | |

**`AutomationStep`** — `id` · `order` · `kind` (8 values) · `label` · `detail` ·
**`n8nNode?`** ← the Phase 3 contract

**`automationRuns`** — ~340 documents

`id` · `workflowId` · `workflowName` D · `status` (`success` · `failed` · `running`) ·
`startedAt` · `durationMs` · `trigger` · `entityLabel` D · `error?` · `stepsCompleted` ·
`stepsTotal`

---

## A.16 `integrations` and `orgSettings`

**`integrations`** — 14 documents

`id` · `name` · `category` (7 values) · `description` ·
`status` (`connected` · `available` · `error`) · `connectedAt?` · `lastSyncAt?` ·
**`viaN8n`** ← marks the Phase 3 set

**`orgSettings`** — singleton

`legalName` · `brandName` · `gstin` · `registeredAddress` · `supportEmail` · `supportPhone` ·
`currency` · `timezone` · `financialYearStart` · `approvalThreshold` ·
`defaultCommissionPercent`

⚠️ `approvalThreshold` exists here **and** as `APPROVAL_THRESHOLD` in `rules.ts`. The constant
is authoritative in Phase 1; the settings field is display-only. 🔧 Phase 2 must make the
document authoritative and delete the constant, or they will drift.

---

## A.17 Enum reference

| Type | Values |
|---|---|
| `HotelStatus` | `active` `onboarding` `paused` |
| `HotelCategory` | `business` `resort` `heritage` `beach` `hill_station` `banquet` |
| `MealPlan` | `EP` `CP` `MAP` `AP` |
| `CompanyTier` | `key_account` `corporate` `sme` `travel_agent` |
| `CompanyStatus` | `active` `prospect` `dormant` |
| `CustomerStatus` | `active` `lead` `inactive` |
| `CustomerSource` | `direct` `referral` `website` `ota` `corporate` `walk_in` `campaign` |
| `ReservationStatus` | `draft` `pending_approval` `confirmed` `checked_in` `completed` `cancelled` `no_show` |
| `BookingChannel` | `direct_sales` `corporate` `travel_agent` `website` `phone` `walk_in` |
| `InvoiceStatus` | `draft` `sent` `partially_paid` `paid` `overdue` `void` |
| `PaymentMethod` | `bank_transfer` `upi` `card` `cash` `cheque` |
| `CommissionStatus` | `accrued` `approved` `paid` |
| `AuditAction` | `created` `updated` `status_changed` `cancelled` `approved` `merged` `exported` `viewed` `note_added` `email_sent` |
| `NotificationChannel` | `in_app` `email` `whatsapp` `sms` `push` |
| `NotificationCategory` | `reservation` `approval` `payment` `system` `customer` `automation` |
| `AutomationStatus` | `active` `paused` `draft` |
| `AutomationStepKind` | `generate_pdf` `send_email` `send_whatsapp` `update_record` `notify_user` `webhook` `wait` `condition` |
| `RunStatus` | `success` `failed` `running` |
| `Role` | `super_admin` `admin` `sales_manager` `salesperson` `hotel_manager` `finance` `support` `viewer` |

---

← [Index](README.md)
