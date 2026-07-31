import type { ImportEntity, MealPlan } from "@/data/types";

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
  fields: ImportField[];
  /** Fields whose normalised value identifies a duplicate. */
  duplicateKeys: { field: string; normalise: (v: string) => string; label: string }[];
  /** Two example rows for the downloadable template. */
  samples: Record<string, string>[];
  /** Builds the stored document from a mapped row. */
  toDocument: (row: Record<string, string>) => Record<string, unknown>;
}

/* ══════════════════════════════════════════════════════════════════
   CUSTOMERS
   ══════════════════════════════════════════════════════════════════ */

export const CUSTOMER_IMPORT: ImportDescriptor = {
  entity: "customers",
  label: "Customers",
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

export const COMPANY_IMPORT: ImportDescriptor = {
  entity: "companies",
  label: "Companies",
  description:
    "Corporate accounts and travel agents. Negotiated discount and payment terms apply " +
    "automatically to their bookings.",
  fields: [
    {
      key: "name", label: "Company Name", required: true,
      aliases: ["company", "account", "trading name", "organisation", "organization"],
      example: "Meridian Logistics",
    },
    {
      key: "legalName", label: "Legal Name", required: false,
      aliases: ["registered name", "legal entity"],
      example: "Meridian Logistics Pvt Ltd",
      hint: "Appears on invoices. Defaults to the company name.",
    },
    {
      key: "gstin", label: "GSTIN", required: true,
      aliases: ["gst", "gst number", "gst no", "tax id", "gstin number"],
      example: "27AABCM1234M1Z5",
      hint: "15 characters. Appears on every invoice.",
      validate: gstin,
      transform: (v) => v.replace(/\s/g, "").toUpperCase(),
    },
    {
      key: "email", label: "Email", required: false,
      aliases: ["e-mail", "billing email", "company email"],
      example: "accounts@meridian.com",
      validate: email,
      transform: (v) => v.trim().toLowerCase(),
    },
    {
      key: "phone", label: "Phone", required: false,
      aliases: ["contact", "phone number", "landline"],
      example: "+91 20 4890 1200",
      validate: phone,
    },
    {
      key: "contactPerson", label: "Contact Person", required: false,
      aliases: ["contact name", "primary contact", "spoc"],
      example: "Rohan Kulkarni",
    },
    {
      key: "address", label: "Billing Address", required: false,
      aliases: ["address", "billing", "street"],
      example: "5th Floor, Amar Tech Park, Balewadi",
    },
    {
      key: "city", label: "City", required: true,
      aliases: ["town"],
      example: "Pune",
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
      key: "status", label: "Status", required: false,
      aliases: ["account status"],
      example: "active",
      hint: "active, prospect or dormant. Defaults to prospect.",
      validate: oneOf(["active", "prospect", "dormant"]),
      transform: (v) => slug(v) || "prospect",
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
      aliases: ["comment", "remarks"],
      example: "Renews contract every April",
    },
  ],
  duplicateKeys: [
    { field: "gstin", normalise: (v) => v.replace(/\s/g, "").toUpperCase(), label: "GSTIN" },
    { field: "name", normalise: (v) => v.trim().toLowerCase(), label: "company name" },
  ],
  samples: [
    {
      "Company Name": "Meridian Logistics", "Legal Name": "Meridian Logistics Pvt Ltd",
      GSTIN: "27AABCM1234M1Z5", Email: "accounts@meridian.com", Phone: "+91 20 4890 1200",
      "Contact Person": "Rohan Kulkarni", "Billing Address": "5th Floor, Amar Tech Park, Balewadi",
      City: "Pune", State: "Maharashtra", Industry: "Logistics", Tier: "corporate",
      Status: "active", "Credit Limit": "500000", "Payment Terms": "30", "Discount %": "10",
      Website: "www.meridian.com", Notes: "Renews contract every April",
    },
    {
      "Company Name": "Bluewave Travel", "Legal Name": "Bluewave Travel LLP",
      GSTIN: "29AABCB5678N1Z2", Email: "ops@bluewave.travel", Phone: "+91 80 4123 7788",
      "Contact Person": "Meera Nair", "Billing Address": "12 MG Road",
      City: "Bengaluru", State: "Karnataka", Industry: "Travel", Tier: "travel_agent",
      Status: "active", "Credit Limit": "250000", "Payment Terms": "15", "Discount %": "12",
      Website: "www.bluewave.travel", Notes: "",
    },
  ],
  toDocument: (row) => ({
    name: row.name ?? "",
    legalName: row.legalName || row.name || "",
    gstin: (row.gstin ?? "").replace(/\s/g, "").toUpperCase(),
    email: (row.email ?? "").trim().toLowerCase(),
    phone: row.phone ?? "",
    contacts: row.contactPerson
      ? [{ name: row.contactPerson, designation: "", email: row.email ?? "", phone: row.phone ?? "" }]
      : [],
    address: row.address ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    industry: row.industry ?? "",
    tier: slug(row.tier ?? "") || "sme",
    status: slug(row.status ?? "") || "prospect",
    creditLimit: Number((row.creditLimit ?? "").replace(/[^\d.]/g, "")) || 0,
    paymentTermDays: Number((row.paymentTermDays ?? "").replace(/\D/g, "")) || 30,
    negotiatedDiscountPercent:
      Number((row.negotiatedDiscountPercent ?? "").replace(/[^\d.]/g, "")) || 0,
    website: row.website ?? "",
    notes: row.notes ?? "",
  }),
};

/* ══════════════════════════════════════════════════════════════════
   HOTELS
   ══════════════════════════════════════════════════════════════════ */

const MEAL_PLAN_CODES: MealPlan[] = ["EP", "AP", "MAP", "ALL_INCLUSIVE"];

export const HOTEL_IMPORT: ImportDescriptor = {
  entity: "hotels",
  label: "Properties",
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
  ],
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
    },
    {
      "Property Name": "Hotel Centre Point", "Short Name": "Centre Point",
      City: "Solapur", State: "Maharashtra", Country: "India",
      Address: "Station Road", "Contact Person": "Prakash Jadhav",
      Email: "front.office@centrepoint.in", Phone: "+91 217 231 4400",
      Category: "business", "Star Rating": "3", "Total Rooms": "42", Status: "active",
      "Meal Plans": "EP, CP",
      Description: "",
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
  }),
};

export const DESCRIPTORS: Record<ImportEntity, ImportDescriptor> = {
  customers: CUSTOMER_IMPORT,
  companies: COMPANY_IMPORT,
  hotels: HOTEL_IMPORT,
};
