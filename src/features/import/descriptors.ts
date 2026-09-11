import { MEAL_PLANS, type ImportEntity, type MealPlan } from "@/data/types";
import { companyDetailTags } from "@/lib/companyDetails";
import { companyNameKey } from "@/lib/companyName";

/* ══════════════════════════════════════════════════════════════════
   IMPORT DESCRIPTORS

   One descriptor per importable entity. The import engine is generic;
   everything entity-specific lives here, so adding a fourth entity is
   a new descriptor rather than a new screen.
   ══════════════════════════════════════════════════════════════════ */

export interface ImportField {
  /** The document field this column becomes. */
  key: string;
  /** Column heading in the template, and the label in the mapper. */
  label: string;
  required: boolean;
  /** Header spellings that auto-map to this field, beyond the label. */
  aliases: string[];
  /** Shown in the template's example row and in the field guide. */
  example: string;
  hint?: string;
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  /**
   * A failed check WARNS instead of rejecting the row, and the value is
   * kept as typed.
   *
   * ⚠️ For columns that matter less than the row they sit in. On a lead
   * list the company is the point; a phone number missing a digit is a
   * thing to fix later, not a reason to lose the company.
   */
  lenient?: boolean;
  /** Converts the raw cell into the stored value. */
  transform?: (value: string) => unknown;
}

/* ── Shared validators ─────────────────────────────────────────── */

const email = (v: string): string | null =>
  !v ? null : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? null : "Not a valid email address";

const phone = (v: string): string | null => {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 ? null : "Needs at least 10 digits";
};

const gstin = (v: string): string | null => {
  if (!v) return null;
  const clean = v.replace(/\s/g, "").toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(clean)
    ? null
    : "Not a valid 15-character GSTIN";
};

const positiveInt = (v: string): string | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? null : "Must be a number";
};

const oneOf = (values: string[]) => (v: string): string | null => {
  if (!v) return null;
  return values.includes(v.trim().toLowerCase().replace(/\s+/g, "_"))
    ? null
    : `Must be one of: ${values.join(", ")}`;
};

/* Normalisers used for duplicate detection. Kept identical to the
   repository so the import and the form agree on what a duplicate is. */
export const normaliseEmail = (v: string) => v.trim().toLowerCase();
export const normalisePhone = (v: string) => v.replace(/\D/g, "").slice(-10);

const slug = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "_");

export interface ImportDescriptor {
  entity: ImportEntity;
  label: string;
  /** One line explaining what this import is for. */
  description: string;
  /**
   * Whether an imported record belongs to a person's book — and so
   * whether the importer offers to tag the file to a salesperson.
   *
   * ⚠️ Customers and companies, not properties. `ownerId` is what scopes
   * a salesperson's list, and nothing is scoped by who owns a property:
   * every role reads every hotel. Offering "belongs to Haider" on a
   * property import would be a control that changes nothing.
   */
  ownable: boolean;
  fields: ImportField[];
  /**
   * Checks that span more than one column, run after the per-field
   * checks pass.
   *
   * ⚠️ A field validator sees one cell and cannot see a row where two
   * columns are individually fine and jointly useless — a bank branch
   * with no account number being the case this exists for.
   */
  checkRow?: (mapped: Record<string, string>) => { errors?: string[]; warnings?: string[] };
  /** Fields whose normalised value identifies a duplicate. */
  duplicateKeys: { field: string; normalise: (v: string) => string; label: string }[];
  /**
   * Rows that describe the same record, combined into one instead of
   * rejected as duplicates.
   *
   * ⚠️ For lists kept one row per PERSON rather than per record. A lead
   * sheet with two contacts at the same company repeats the company
   * name, and the old rule — "same name as row 4" is an error — threw
   * the second contact away along with it.
   */
  groupBy?: {
    field: string;
    normalise: (v: string) => string;
    /** Fields that ought to agree within a group; a disagreement warns. */
    shouldAgree?: string[];
  };
  /** Two example rows for the downloadable template. */
  samples: Record<string, string>[];
  /** Builds the stored document from a mapped row. */
  toDocument: (row: Record<string, string>) => Record<string, unknown>;
  /** Builds ONE document from every row in a group. Required with groupBy. */
  toDocumentGroup?: (rows: Record<string, string>[]) => Record<string, unknown>;
}

/* ══════════════════════════════════════════════════════════════════
   CUSTOMERS
   ══════════════════════════════════════════════════════════════════ */

export const CUSTOMER_IMPORT: ImportDescriptor = {
  entity: "customers",
  label: "Customers",
  ownable: true,
  description:
    "Guests and booking contacts. Email and phone must be unique across the platform.",
  fields: [
    {
      key: "firstName", label: "First Name", required: true,
      aliases: ["first", "firstname", "given name", "fname"],
      example: "Ananya",
    },
    {
      key: "lastName", label: "Last Name", required: true,
      aliases: ["last", "lastname", "surname", "family name", "lname"],
      example: "Bose",
    },
    {
      key: "email", label: "Email", required: true,
      aliases: ["e-mail", "email address", "mail", "email id"],
      example: "ananya.bose@meridian.com",
      hint: "Must be unique. Used for confirmations and vouchers.",
      validate: email,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: "phone", label: "Phone", required: true,
      aliases: ["mobile", "contact", "phone number", "contact number", "mobile no"],
      example: "+91 98765 43210",
      hint: "Must be unique. Compared on the last 10 digits, so any format works.",
      validate: phone,
    },
    {
      key: "companyName", label: "Company", required: false,
      aliases: ["company name", "organisation", "organization", "firm", "account"],
      example: "Meridian Logistics",
      hint: "Matched to an existing company by name. Leave blank for individuals.",
    },
    {
      key: "designation", label: "Designation", required: false,
      aliases: ["title", "role", "job title", "position"],
      example: "Travel Desk Head",
    },
    {
      key: "city", label: "City", required: false,
      aliases: ["town", "location"],
      example: "Pune",
    },
    {
      key: "state", label: "State", required: false,
      aliases: ["province", "region"],
      example: "Maharashtra",
    },
    {
      key: "status", label: "Status", required: false,
      aliases: ["customer status", "stage"],
      example: "active",
      hint: "active, lead or inactive. Defaults to lead.",
      validate: oneOf(["active", "lead", "inactive"]),
      transform: (v) => slug(v) || "lead",
    },
    {
      key: "source", label: "Source", required: false,
      aliases: ["lead source", "channel", "origin"],
      example: "corporate",
      hint: "direct, referral, website, ota, corporate, walk_in or campaign.",
      validate: oneOf(
        ["direct", "referral", "website", "ota", "corporate", "walk_in", "campaign"],
      ),
      transform: (v) => slug(v) || "direct",
    },
    {
      key: "vip", label: "VIP", required: false,
      aliases: ["is vip", "priority"],
      example: "no",
      hint: "yes or no. A VIP's property is notified before arrival.",
      transform: (v) => ["yes", "y", "true", "1"].includes(v.trim().toLowerCase()),
    },
    {
      key: "notes", label: "Notes", required: false,
      aliases: ["comment", "remarks", "internal notes"],
      example: "Prefers a high floor away from the lift",
      hint: "Internal only. Never shown to the guest.",
    },
  ],
  duplicateKeys: [
    { field: "email", normalise: normaliseEmail, label: "email address" },
    { field: "phone", normalise: normalisePhone, label: "phone number" },
  ],
  samples: [
    {
      "First Name": "Ananya", "Last Name": "Bose",
      Email: "ananya.bose@meridian.com", Phone: "+91 98765 43210",
      Company: "Meridian Logistics", Designation: "Travel Desk Head",
      City: "Pune", State: "Maharashtra", Status: "active", Source: "corporate",
      VIP: "no", Notes: "Prefers a high floor away from the lift",
    },
    {
      "First Name": "Vikram", "Last Name": "Desai",
      Email: "vikram.desai@gmail.com", Phone: "9876543211",
      Company: "", Designation: "", City: "Surat", State: "Gujarat",
      Status: "lead", Source: "website", VIP: "no", Notes: "",
    },
  ],
  toDocument: (row) => ({
    firstName: row.firstName ?? "",
    lastName: row.lastName ?? "",
    fullName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(),
    email: (row.email ?? "").trim().toLowerCase(),
    emailNormalised: normaliseEmail(row.email ?? ""),
    phone: row.phone ?? "",
    phoneNormalised: normalisePhone(row.phone ?? ""),
    companyName: row.companyName || undefined,
    designation: row.designation || undefined,
    city: row.city ?? "",
    state: row.state ?? "",
    status: slug(row.status ?? "") || "lead",
    source: slug(row.source ?? "") || "direct",
    vip: ["yes", "y", "true", "1"].includes((row.vip ?? "").trim().toLowerCase()),
    preferences: [],
    notes: row.notes ?? "",
  }),
};

/* ══════════════════════════════════════════════════════════════════
   COMPANIES
   ══════════════════════════════════════════════════════════════════ */

/**
 * The words people actually type in a STATUS column, folded onto the
 * three the system knows.
 *
 * ⚠️ A lead list's status is a sales stage — "interested", "follow up",
 * "not interested" — and the system's is an account state. Rejecting a
 * company because its status said "Follow up" loses the company to save
 * a word, so unknown words import as prospect and the original is kept
 * in the notes. Add the owner's real vocabulary here once it is known.
 */
const COMPANY_STATUS_WORDS: Record<string, "active" | "prospect" | "dormant"> = {
  active: "active", customer: "active", client: "active", existing: "active",
  converted: "active", won: "active", booked: "active", onboarded: "active",
  live: "active", regular: "active", confirmed: "active", ongoing: "active",

  prospect: "prospect", lead: "prospect", new: "prospect", interested: "prospect",
  followup: "prospect", inprogress: "prospect", pending: "prospect",
  contacted: "prospect", meeting: "prospect", meetingdone: "prospect",
  hot: "prospect", warm: "prospect", cold: "prospect", negotiation: "prospect",
  proposalsent: "prospect", quoted: "prospect", quotationsent: "prospect",
  callback: "prospect", open: "prospect",

  dormant: "dormant", inactive: "dormant", notinterested: "dormant", lost: "dormant",
  closed: "dormant", dead: "dormant", rejected: "dormant", noresponse: "dormant",
  notresponding: "dormant", donotcall: "dormant", dnc: "dormant",
};

const statusKey = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");

/** The system status for whatever was typed. Blank or unknown → prospect. */
export function companyStatusFor(raw: string): "active" | "prospect" | "dormant" {
  return COMPANY_STATUS_WORDS[statusKey(raw)] ?? "prospect";
}

/**
 * Builds one company from every row that names it.
 *
 * ⚠️ The single source of truth — `toDocument` is this with one row, so a
 * lone row and a group of five cannot be built differently.
 */
function companyFromRows(rows: Record<string, string>[]): Record<string, unknown> {
  const first = (key: string) =>
    rows.map((r) => (r[key] ?? "").trim()).find((v) => v.length > 0) ?? "";

  /* A row naming a person becomes a contact. A row with a number or an
     email but NO name has nobody to attach them to, so they fall back to
     the company's own line — rather than a nameless contact nobody can
     address. */
  const contacts: { name: string; designation: string; phone: string; email: string }[] = [];
  const seen = new Set<string>();
  let spillPhone = "";
  let spillEmail = "";

  for (const r of rows) {
    const name = (r.contactPerson ?? "").trim();
    const phone = (r.contactPhone ?? "").trim();
    const email = (r.contactEmail ?? "").trim().toLowerCase();
    if (!name) {
      spillPhone ||= phone;
      spillEmail ||= email;
      continue;
    }
    // The same person listed twice is one contact.
    const key = `${name.toLowerCase()}|${phone.replace(/\D/g, "")}|${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({ name, designation: (r.designation ?? "").trim(), phone, email });
  }

  /* ⚠️ The original STATUS words are kept whenever they were not already
     one of the system's own. "Interested" and "Follow up" both become
     prospect, and the difference is exactly what the salesperson needs. */
  const statusWords = [
    ...new Set(rows.map((r) => (r.status ?? "").trim()).filter(Boolean)),
  ].filter((w) => !["active", "prospect", "dormant"].includes(statusKey(w)));
  const notes = [
    ...new Set(rows.map((r) => (r.notes ?? "").trim()).filter(Boolean)),
    ...(statusWords.length ? [`Status in the imported sheet: ${statusWords.join(", ")}`] : []),
  ].join("\n");

  const name = first("name");
  const companyEmail = (first("companyEmail") || spillEmail).toLowerCase();
  const companyPhone = first("companyPhone") || spillPhone;
  const city = first("city");
  return {
    name,
    legalName: first("legalName") || name,
    gstin: first("gstin").replace(/\s/g, "").toUpperCase(),
    email: companyEmail,
    phone: companyPhone,
    contacts,
    /* The Details filter's tags, computed from exactly what is written. */
    detailTags: companyDetailTags({ city, phone: companyPhone, email: companyEmail, contacts }),
    nameKey: companyNameKey(name),
    address: first("address"),
    city,
    state: first("state"),
    industry: first("industry"),
    tier: slug(first("tier")) || "sme",
    status: companyStatusFor(first("status")),
    creditLimit: Number(first("creditLimit").replace(/[^\d.]/g, "")) || 0,
    paymentTermDays: Number(first("paymentTermDays").replace(/\D/g, "")) || 30,
    negotiatedDiscountPercent:
      Number(first("negotiatedDiscountPercent").replace(/[^\d.]/g, "")) || 0,
    website: first("website"),
    notes,
  };
}

export const COMPANY_IMPORT: ImportDescriptor = {
  entity: "companies",
  label: "Companies",
  ownable: true,
  description:
    "Corporate accounts, travel agents and leads. Only the company name is required. Contact " +
    "person, number, email, city and status are all optional. The same company on several rows " +
    "becomes one company with several contact persons.",
  fields: [
    /* ⚠️ Order is load-bearing twice. The first three are the columns the
       review table shows, and the auto-mapper's loose pass walks fields in
       this order — specific ones must come before generic ones. */
    {
      key: "name", label: "Company Name", required: true,
      aliases: [
        "company", "account", "account name", "client", "client name", "organisation",
        "organization", "firm", "business name", "trading name", "corporate",
        "corporate name", "party name", "name of company", "company / ta", "company or ta",
      ],
      example: "Meridian Logistics",
      hint: "The only required column.",
    },
    {
      key: "contactPerson", label: "Contact Person", required: false,
      aliases: [
        "contact name", "person", "spoc", "poc", "point of contact", "concerned person",
        "key contact", "contact", "name of contact person", "contact person name",
      ],
      example: "Rohan Kulkarni",
      hint: "The person you deal with there. Several rows for one company give it several contacts.",
    },
    {
      key: "contactPhone", label: "Contact Number", required: false, lenient: true,
      aliases: [
        "contact no", "contact number", "mobile", "mobile no", "mobile number", "phone",
        "phone no", "phone number", "cell", "cell no", "whatsapp", "whatsapp no",
        "telephone", "tel", "contact phone",
      ],
      example: "+91 98765 43210",
      hint: "The contact person's number. A malformed one imports with a warning.",
      validate: phone,
    },
    {
      key: "contactEmail", label: "Email ID", required: false, lenient: true,
      aliases: [
        "email", "email address", "e-mail", "e mail", "mail", "mail id", "contact email",
        "email of contact",
      ],
      example: "rohan@meridian.com",
      hint: "The contact person's email. A malformed one imports with a warning.",
      validate: email,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: "designation", label: "Designation", required: false,
      aliases: ["title", "position", "role", "job title", "post", "designation of contact"],
      example: "Travel Desk Head",
    },
    {
      key: "city", label: "City", required: false,
      aliases: ["town", "location", "place", "city name", "base"],
      example: "Pune",
    },
    {
      key: "status", label: "Status", required: false, lenient: true,
      aliases: ["account status", "lead status", "stage", "company status"],
      example: "prospect",
      hint:
        "active, prospect or dormant. Words like interested, follow up or not interested are " +
        "understood; anything else imports as prospect, with the original word kept in the notes.",
      validate: (v) =>
        !v || COMPANY_STATUS_WORDS[statusKey(v)]
          ? null
          : `"${v}" is not a status the system knows. Imported as prospect, the word kept in notes`,
    },
    {
      key: "legalName", label: "Legal Name", required: false,
      aliases: ["registered name", "legal entity"],
      example: "Meridian Logistics Pvt Ltd",
      hint: "Appears on invoices. Defaults to the company name.",
    },
    {
      /* ⚠️ Optional. Plenty of accounts are not GST-registered, and
         plenty more were recorded before anyone tracked it — requiring
         it rejected those rows outright rather than importing a company
         with a gap. The format check still runs on whatever IS supplied,
         so a mistyped number is still caught. */
      key: "gstin", label: "GSTIN", required: false,
      aliases: ["gst", "gst number", "gst no", "tax id", "gstin number"],
      example: "27AABCM1234M1Z5",
      hint: "15 characters, if the account has one. Appears on invoices.",
      validate: gstin,
      transform: (v) => v.replace(/\s/g, "").toUpperCase(),
    },
    {
      key: "companyPhone", label: "Company Phone", required: false, lenient: true,
      aliases: ["office phone", "landline", "board line", "board number", "office number", "reception"],
      example: "+91 20 4890 1200",
      hint: "The company's own line, as distinct from the contact person's.",
      validate: phone,
    },
    {
      key: "companyEmail", label: "Company Email", required: false, lenient: true,
      aliases: ["billing email", "accounts email", "office email", "official email"],
      example: "accounts@meridian.com",
      validate: email,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: "address", label: "Billing Address", required: false,
      aliases: ["address", "billing", "street"],
      example: "5th Floor, Amar Tech Park, Balewadi",
    },
    {
      key: "state", label: "State", required: false,
      aliases: ["province", "region"],
      example: "Maharashtra",
    },
    {
      key: "industry", label: "Industry", required: false,
      aliases: ["sector", "vertical"],
      example: "Logistics",
    },
    {
      key: "tier", label: "Tier", required: false,
      aliases: ["account tier", "category", "segment"],
      example: "corporate",
      hint: "key_account, corporate, sme or travel_agent. Defaults to sme.",
      validate: oneOf(["key_account", "corporate", "sme", "travel_agent"]),
      transform: (v) => slug(v) || "sme",
    },
    {
      key: "creditLimit", label: "Credit Limit", required: false,
      aliases: ["credit", "limit", "credit amount"],
      example: "500000",
      hint: "In rupees, digits only.",
      validate: positiveInt,
      transform: (v) => Number(v.replace(/[^\d.]/g, "")) || 0,
    },
    {
      key: "paymentTermDays", label: "Payment Terms", required: false,
      aliases: ["credit terms", "terms", "payment days", "credit days"],
      example: "30",
      hint: "Days. Sets the due date on every invoice. Defaults to 30.",
      validate: positiveInt,
      transform: (v) => Number(v.replace(/\D/g, "")) || 30,
    },
    {
      key: "negotiatedDiscountPercent", label: "Discount %", required: false,
      aliases: ["discount", "negotiated discount", "discount percent"],
      example: "10",
      hint: "Applied automatically to room charges on this account's bookings.",
      validate: (v) => {
        if (!v) return null;
        const n = Number(v.replace(/[^\d.]/g, ""));
        return Number.isFinite(n) && n >= 0 && n <= 50 ? null : "Must be between 0 and 50";
      },
      transform: (v) => Number(v.replace(/[^\d.]/g, "")) || 0,
    },
    {
      key: "website", label: "Website", required: false,
      aliases: ["url", "site"],
      example: "www.meridian.com",
    },
    {
      key: "notes", label: "Notes", required: false,
      aliases: ["comment", "comments", "remarks", "remark"],
      example: "Renews contract every April",
    },
  ],
  duplicateKeys: [
    { field: "gstin", normalise: (v) => v.replace(/\s/g, "").toUpperCase(), label: "GSTIN" },
    { field: "name", normalise: (v) => v.trim().toLowerCase(), label: "company name" },
  ],
  groupBy: {
    field: "name",
    normalise: (v) => v.trim().toLowerCase().replace(/\s+/g, " "),
    shouldAgree: ["city"],
  },
  samples: [
    {
      "Company Name": "Meridian Logistics", "Contact Person": "Rohan Kulkarni",
      "Contact Number": "+91 98765 43210", "Email ID": "rohan@meridian.com",
      Designation: "Travel Desk Head", City: "Pune", Status: "active",
      "Legal Name": "Meridian Logistics Pvt Ltd", GSTIN: "27AABCM1234M1Z5",
      "Company Phone": "+91 20 4890 1200", "Company Email": "accounts@meridian.com",
      "Billing Address": "5th Floor, Amar Tech Park, Balewadi", State: "Maharashtra",
      Industry: "Logistics", Tier: "corporate", "Credit Limit": "500000",
      "Payment Terms": "30", "Discount %": "10", Website: "www.meridian.com",
      Notes: "Renews contract every April",
    },
    {
      "Company Name": "Bluewave Travel", "Contact Person": "Meera Nair",
      "Contact Number": "9812345678", "Email ID": "meera@bluewave.travel",
      Designation: "Operations Manager", City: "Bengaluru", Status: "interested",
      "Legal Name": "", GSTIN: "", "Company Phone": "", "Company Email": "",
      "Billing Address": "", State: "Karnataka", Industry: "Travel", Tier: "travel_agent",
      "Credit Limit": "", "Payment Terms": "", "Discount %": "", Website: "", Notes: "",
    },
  ],
  toDocument: (row) => companyFromRows([row]),
  toDocumentGroup: companyFromRows,
};

/* ══════════════════════════════════════════════════════════════════
   HOTELS
   ══════════════════════════════════════════════════════════════════ */

const MEAL_PLAN_CODES: MealPlan[] = MEAL_PLANS;

/** 4 letters, a zero, then 6 characters. The zero is reserved. */
const ifsc = (v: string): string | null => {
  if (!v) return null;
  const clean = v.replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(clean) ? null : "Not a valid 11-character IFSC";
};

/* ⚠️ Digits only, and NOT stored as a number. Indian account numbers
   run past 15 digits and frequently carry leading zeros; Number() would
   round the long ones and drop the zeros, and both corruptions produce
   a plausible-looking account that a guest's transfer fails against. */
const accountNumber = (v: string): string | null => {
  if (!v) return null;
  const clean = v.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(clean)) return "Digits only";
  return clean.length >= 6 && clean.length <= 20 ? null : "Must be 6 to 20 digits";
};

export const HOTEL_IMPORT: ImportDescriptor = {
  entity: "hotels",
  label: "Properties",
  ownable: false,
  description:
    "Partner properties. Room types and seasons are configured per property after import. " +
    "Commission is set separately and is visible only to Owner and Admin.",
  fields: [
    {
      key: "name", label: "Property Name", required: true,
      aliases: ["hotel", "hotel name", "property"],
      example: "Ayati Resort & Spa",
    },
    {
      key: "shortName", label: "Short Name", required: false,
      aliases: ["display name", "abbreviation"],
      example: "Ayati Resort",
      hint: "Used in tables where the full name would wrap. Defaults to the property name.",
    },
    {
      key: "city", label: "City", required: true,
      aliases: ["town", "location"],
      example: "Mahabaleshwar",
    },
    {
      key: "state", label: "State", required: true,
      aliases: ["province", "region"],
      example: "Maharashtra",
    },
    {
      key: "country", label: "Country", required: false,
      aliases: [],
      example: "India",
      hint: "Defaults to India.",
    },
    {
      key: "address", label: "Address", required: false,
      aliases: ["street", "full address"],
      example: "Panchgani-Mahabaleshwar Road",
    },
    {
      key: "contactPerson", label: "Contact Person", required: false,
      aliases: ["contact", "manager", "spoc", "reservations contact"],
      example: "Sanjay Rane",
    },
    {
      key: "email", label: "Email", required: false,
      aliases: ["e-mail", "reservations email"],
      example: "reservations@ayatiresort.com",
      validate: email,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: "phone", label: "Phone", required: false,
      aliases: ["contact number", "landline"],
      example: "+91 2168 240 500",
      validate: phone,
    },
    {
      key: "category", label: "Category", required: false,
      aliases: ["type", "property type"],
      example: "resort",
      hint: "business, resort, heritage, beach, hill_station or banquet.",
      validate: oneOf(
        ["business", "resort", "heritage", "beach", "hill_station", "banquet"],
      ),
      transform: (v) => slug(v) || "business",
    },
    {
      key: "starRating", label: "Star Rating", required: false,
      aliases: ["stars", "rating"],
      example: "4",
      validate: (v) => {
        if (!v) return null;
        const n = Number(v);
        return n >= 1 && n <= 5 ? null : "Must be between 1 and 5";
      },
      transform: (v) => Number(v) || 3,
    },
    {
      key: "totalRooms", label: "Total Rooms", required: false,
      aliases: ["rooms", "room count", "keys", "inventory"],
      example: "30",
      validate: positiveInt,
      transform: (v) => Number(v.replace(/\D/g, "")) || 0,
    },
    {
      key: "status", label: "Status", required: false,
      aliases: ["property status"],
      example: "active",
      hint: "active, onboarding or paused. Paused properties cannot take new bookings.",
      validate: oneOf(["active", "onboarding", "paused"]),
      transform: (v) => slug(v) || "onboarding",
    },
    {
      key: "mealPlans", label: "Meal Plans", required: false,
      aliases: ["plans", "board", "meal plan"],
      example: "EP, MAP",
      hint: `Comma-separated. Any of: ${MEAL_PLAN_CODES.join(", ")}.`,
    },
    {
      key: "description", label: "Description", required: false,
      aliases: ["about", "summary"],
      example: "A hillside retreat overlooking the Krishna valley.",
    },

    /* ── Bank details ────────────────────────────────────────────
       Printed on the guest's voucher, so these are the property's
       collecting account, not Fidato's. All optional: a property
       settled through Fidato has no account to publish. */
    {
      key: "bankAccountName", label: "Account Name", required: false,
      aliases: [
        "bank account name", "account holder", "account holder name",
        "beneficiary", "beneficiary name", "a/c name",
      ],
      example: "Ayati Hospitality LLP",
      hint: "Exactly as the bank holds it. A mismatch fails the transfer.",
    },
    {
      key: "bankAccountNumber", label: "Account Number", required: false,
      aliases: [
        "bank account number", "account no", "a/c no", "a/c number",
        "account", "bank account",
      ],
      example: "50200012345678",
      hint: "Digits only. Leading zeros are kept.",
      validate: accountNumber,
      transform: (v) => v.replace(/[\s-]/g, ""),
    },
    {
      key: "bankName", label: "Bank", required: false,
      aliases: ["bank name", "banker"],
      example: "HDFC Bank",
    },
    {
      key: "bankBranch", label: "Branch", required: false,
      aliases: ["bank branch", "branch name"],
      example: "Mahabaleshwar",
    },
    {
      key: "bankIfsc", label: "IFSC", required: false,
      aliases: ["ifsc code", "ifs code", "bank ifsc", "rtgs", "neft"],
      example: "HDFC0001234",
      hint: "11 characters. Uppercased automatically.",
      validate: ifsc,
      transform: (v) => v.replace(/\s/g, "").toUpperCase(),
    },
  ],

  /**
   * ⚠️ The voucher prints a bank block only when it has BOTH an account
   * name and a number — a bare IFSC, or an account with nobody to pay,
   * is worse than no block at all. So a row carrying a bank name and a
   * branch but no account number imports perfectly and then silently
   * prints nothing, and the property looks configured on the import
   * summary. Warn rather than reject: the property itself is fine, and
   * the operator is the one who knows whether the account is missing or
   * simply not held.
   */
  checkRow: (row) => {
    const bank = ["bankAccountName", "bankAccountNumber", "bankName", "bankBranch", "bankIfsc"];
    const filled = bank.filter((k) => (row[k] ?? "").trim());
    if (!filled.length) return {};

    const missing = (["bankAccountName", "bankAccountNumber"] as const)
      .filter((k) => !(row[k] ?? "").trim())
      .map((k) => (k === "bankAccountName" ? "account name" : "account number"));
    if (!missing.length) return {};

    return {
      warnings: [
        `Bank details are incomplete: no ${missing.join(" or ")}. ` +
        "The property will import, but its vouchers will show no bank details until this is added.",
      ],
    };
  },

  duplicateKeys: [
    {
      field: "name",
      normalise: (v) => v.trim().toLowerCase(),
      label: "property name",
    },
  ],
  samples: [
    {
      "Property Name": "Ayati Resort & Spa", "Short Name": "Ayati Resort",
      City: "Mahabaleshwar", State: "Maharashtra", Country: "India",
      Address: "Panchgani-Mahabaleshwar Road", "Contact Person": "Sanjay Rane",
      Email: "reservations@ayatiresort.com", Phone: "+91 2168 240 500",
      Category: "resort", "Star Rating": "4", "Total Rooms": "30", Status: "active",
      "Meal Plans": "EP, MAP, AP",
      Description: "A hillside retreat overlooking the Krishna valley.",
      "Account Name": "Ayati Hospitality LLP", "Account Number": "50200012345678",
      Bank: "HDFC Bank", Branch: "Mahabaleshwar", IFSC: "HDFC0001234",
    },
    {
      "Property Name": "Hotel Centre Point", "Short Name": "Centre Point",
      City: "Solapur", State: "Maharashtra", Country: "India",
      Address: "Station Road", "Contact Person": "Prakash Jadhav",
      Email: "front.office@centrepoint.in", Phone: "+91 217 231 4400",
      Category: "business", "Star Rating": "3", "Total Rooms": "42", Status: "active",
      "Meal Plans": "EP, CP",
      Description: "",
      /* Deliberately blank: shows that a property with no published
         account is a complete row, not an unfinished one. */
      "Account Name": "", "Account Number": "", Bank: "", Branch: "", IFSC: "",
    },
  ],
  toDocument: (row) => ({
    name: row.name ?? "",
    shortName: row.shortName || row.name || "",
    city: row.city ?? "",
    state: row.state ?? "",
    country: row.country || "India",
    address: row.address ?? "",
    contactPerson: row.contactPerson ?? "",
    email: (row.email ?? "").trim().toLowerCase(),
    phone: row.phone ?? "",
    category: slug(row.category ?? "") || "business",
    starRating: Number(row.starRating) || 3,
    totalRooms: Number((row.totalRooms ?? "").replace(/\D/g, "")) || 0,
    status: slug(row.status ?? "") || "onboarding",
    description: row.description ?? "",
    mealPlans: (row.mealPlans ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase().replace(/\s+/g, "_"))
      .filter((s): s is MealPlan => (MEAL_PLAN_CODES as string[]).includes(s)),
    roomMix: [], features: [], facilities: [], amenities: [],
    thingsToDo: [], distances: [], contacts: [],
    onboardedAt: new Date().toISOString().slice(0, 10),

    /* ⚠️ Normalised here as well as in the property form. The form only
       protects what the form wrote, and these two are read off a
       voucher and typed into a banking app: a stray space in an account
       number and a lowercase IFSC both read as a fault on a document
       about money. */
    bankAccountName: (row.bankAccountName ?? "").trim(),
    bankAccountNumber: (row.bankAccountNumber ?? "").replace(/[\s-]/g, ""),
    bankName: (row.bankName ?? "").trim(),
    bankBranch: (row.bankBranch ?? "").trim(),
    bankIfsc: (row.bankIfsc ?? "").replace(/\s/g, "").toUpperCase(),
  }),
};

export const DESCRIPTORS: Record<ImportEntity, ImportDescriptor> = {
  customers: CUSTOMER_IMPORT,
  companies: COMPANY_IMPORT,
  hotels: HOTEL_IMPORT,
};
