import { describe, expect, it } from "vitest";
import { guessMapping, validateRows, summarise, templateCsv, buildDocuments, parseFile } from "./engine";
import {
  CUSTOMER_IMPORT, COMPANY_IMPORT, HOTEL_IMPORT, ROOM_TYPE_IMPORT, companyStatusFor,
} from "./descriptors";
import { duplicateValue } from "@/lib/duplicateKey";

/* ══════════════════════════════════════════════════════════════════
   IMPORT ENGINE

   The auto-mapping is the part that fails quietly. A wrong guess does
   not throw — it imports a phone number into the notes field and looks
   like it worked, which is why the mapping is pinned here rather than
   left to be noticed after 800 rows are already in.
   ══════════════════════════════════════════════════════════════════ */

describe("guessMapping", () => {
  it("matches the template's own headings exactly", () => {
    const headers = CUSTOMER_IMPORT.fields.map((f) => f.label);
    const mapping = guessMapping(headers, CUSTOMER_IMPORT);

    for (const field of CUSTOMER_IMPORT.fields) {
      expect(mapping[field.key], `${field.label} should map to itself`).toBe(field.label);
    }
  });

  /* The realistic case: an export from someone else's system, with
     different casing, punctuation and vocabulary. */
  it("matches messy real-world headings", () => {
    const mapping = guessMapping(
      ["FNAME", "surname", "E-Mail Address", "Mobile No", "organisation"],
      CUSTOMER_IMPORT,
    );

    expect(mapping.firstName).toBe("FNAME");
    expect(mapping.lastName).toBe("surname");
    expect(mapping.email).toBe("E-Mail Address");
    expect(mapping.phone).toBe("Mobile No");
    expect(mapping.companyName).toBe("organisation");
  });

  /* ⚠️ Two headers must never claim the same field, and one header
     must never be claimed twice. Either produces a silent data swap. */
  it("never assigns one column to two fields", () => {
    const mapping = guessMapping(
      ["Email", "Email Address", "Phone", "Phone Number"],
      CUSTOMER_IMPORT,
    );
    const used = Object.values(mapping);
    expect(new Set(used).size).toBe(used.length);
  });

  it("leaves fields absent when the file has no column for them", () => {
    const mapping = guessMapping(["First Name", "Last Name"], CUSTOMER_IMPORT);
    expect(mapping.notes).toBeUndefined();
    expect(mapping.city).toBeUndefined();
  });
});

describe("validateRows", () => {
  const mapping = {
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
  };

  const row = (over: Record<string, string> = {}) => ({
    "First Name": "Ananya",
    "Last Name": "Bose",
    Email: "ananya@example.com",
    Phone: "9876543210",
    ...over,
  });

  it("accepts a complete row", () => {
    const [result] = validateRows([row()], mapping, CUSTOMER_IMPORT);
    expect(result!.errors).toEqual([]);
    expect(result!.warnings).toEqual([]);
  });

  it("rejects a missing required field", () => {
    const [result] = validateRows([row({ Email: "" })], mapping, CUSTOMER_IMPORT);
    expect(result!.errors.join(" ")).toContain("Email is required");
  });

  it("rejects a malformed email", () => {
    const [result] = validateRows([row({ Email: "not-an-address" })], mapping, CUSTOMER_IMPORT);
    expect(result!.errors.join(" ")).toContain("valid email");
  });

  /* ⚠️ Two rows for the same person is a mistake in the file, so it is
     an error. A collision with a stored record is a judgement call, so
     it is a warning. Conflating the two either blocks a legitimate
     import or lets a genuine duplicate through. */
  it("errors on a duplicate inside the file, naming the earlier row", () => {
    const rows = validateRows([row(), row()], mapping, CUSTOMER_IMPORT);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors.join(" ")).toContain("row 2");
  });

  it("only warns when the record already exists in the database", () => {
    const rows = validateRows([row()], mapping, CUSTOMER_IMPORT, {
      email: new Set(["ananya@example.com"]),
    });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.warnings.join(" ")).toContain("already exists");
  });

  /* Phone matching is on the last 10 digits, so the same number written
     three ways is one person. */
  it("sees through phone formatting", () => {
    const rows = validateRows(
      [row(), row({ Phone: "+91 98765 43210" }), row({ Phone: "098765-43210" })],
      { ...mapping },
      CUSTOMER_IMPORT,
    );
    expect(rows[1]!.errors.join(" ")).toContain("phone");
    expect(rows[2]!.errors.join(" ")).toContain("phone");
  });

  it("numbers rows as the spreadsheet does, counting the header", () => {
    const rows = validateRows([row(), row({ Email: "b@example.com", Phone: "9000000001" })],
      mapping, CUSTOMER_IMPORT);
    expect(rows[0]!.rowNumber).toBe(2);
    expect(rows[1]!.rowNumber).toBe(3);
  });
});

/* ══════════════════════════════════════════════════════════════════
   A PROPERTY'S BANK DETAILS

   These are printed on the guest's voucher, so a value that survives
   import in a corrupted-but-plausible form is worse than one that is
   rejected: the guest transfers against it and the money goes nowhere.
   ══════════════════════════════════════════════════════════════════ */

describe("property bank details", () => {
  const mapping = Object.fromEntries(HOTEL_IMPORT.fields.map((f) => [f.key, f.label]));

  const hotel = (over: Record<string, string> = {}) => ({
    "Property Name": "Ayati Resort", City: "Mahabaleshwar", State: "Maharashtra",
    "Account Name": "Ayati Hospitality LLP", "Account Number": "50200012345678",
    Bank: "HDFC Bank", Branch: "Mahabaleshwar", IFSC: "HDFC0001234",
    ...over,
  });

  const check = (over: Record<string, string> = {}) =>
    validateRows([hotel(over)], mapping, HOTEL_IMPORT)[0]!;

  it("accepts a property with a full bank block", () => {
    const r = check();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  /* A property settled through Fidato publishes no account. That is a
     complete row, not an unfinished one. */
  it("accepts a property with no bank details at all", () => {
    const r = check({
      "Account Name": "", "Account Number": "", Bank: "", Branch: "", IFSC: "",
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  /**
   * ⚠️ The case this check exists for. Both remaining cells are
   * individually valid, so every field validator passes and the row
   * imports clean — then the voucher, which needs a name AND a number,
   * prints nothing and the property looks configured on the summary.
   */
  it("warns when a bank block is half filled, without rejecting the row", () => {
    const r = check({ "Account Name": "", "Account Number": "" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toContain("no account name or account number");
    expect(r.warnings.join(" ")).toContain("vouchers will show no bank details");
  });

  it("warns when only the account name is missing", () => {
    const r = check({ "Account Name": "" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toContain("no account name");
    expect(r.warnings.join(" ")).not.toContain("account number");
  });

  it("rejects a malformed IFSC", () => {
    expect(check({ IFSC: "HDFC1001234" }).errors.join(" ")).toContain("IFSC");
    expect(check({ IFSC: "HDFC000123" }).errors.join(" ")).toContain("IFSC");
    // Lowercase and spaced is a formatting difference, not an error.
    expect(check({ IFSC: "hdfc 0001234" }).errors).toEqual([]);
  });

  /* ⚠️ Never Number(). Indian account numbers run past 15 digits and
     carry leading zeros; both corruptions look plausible on a voucher. */
  it("keeps a long account number and its leading zeros intact", () => {
    const long = "00110100012345678";
    const r = check({ "Account Number": long });
    expect(r.errors).toEqual([]);
    expect(HOTEL_IMPORT.toDocument(r.mapped).bankAccountNumber).toBe(long);
  });

  it("rejects an account number that is not digits", () => {
    expect(check({ "Account Number": "5020-ABCD-1234" }).errors.join(" "))
      .toContain("Digits only");
  });

  /* Read off a voucher and typed into a banking app, so the stored form
     is the printable one. The property form normalises the same way. */
  it("normalises what it stores", () => {
    const r = check({ IFSC: "hdfc 0001234", "Account Number": "5020 0012 345678" });
    const doc = HOTEL_IMPORT.toDocument(r.mapped);
    expect(doc.bankIfsc).toBe("HDFC0001234");
    expect(doc.bankAccountNumber).toBe("50200012345678");
  });

  /* The headings a property's own accounts email actually uses. */
  it("auto-maps the spellings a finance team writes", () => {
    const guessed = guessMapping(
      ["Property Name", "City", "State", "Beneficiary Name", "A/c No", "Bank Name",
        "Branch Name", "IFSC Code"],
      HOTEL_IMPORT,
    );
    expect(guessed.bankAccountName).toBe("Beneficiary Name");
    expect(guessed.bankAccountNumber).toBe("A/c No");
    expect(guessed.bankName).toBe("Bank Name");
    expect(guessed.bankBranch).toBe("Branch Name");
    expect(guessed.bankIfsc).toBe("IFSC Code");
  });

  /* ⚠️ "Bank", "Account Number" and "Account Name" all contain words the
     others do, and the template ships every one of them as a heading. */
  it("never assigns one bank column to two fields", () => {
    const headers = HOTEL_IMPORT.fields.map((f) => f.label);
    const used = Object.values(guessMapping(headers, HOTEL_IMPORT));
    expect(new Set(used).size).toBe(used.length);
    for (const field of HOTEL_IMPORT.fields) {
      const m = guessMapping(headers, HOTEL_IMPORT);
      expect(m[field.key], `${field.label} should map to itself`).toBe(field.label);
    }
  });

  /* The template is what most operators fill in, so its own sample rows
     must survive the validator they will be checked against. */
  it("validates its own template samples", () => {
    for (const sample of HOTEL_IMPORT.samples) {
      const [r] = validateRows([sample], mapping, HOTEL_IMPORT);
      expect(r!.errors, JSON.stringify(sample)).toEqual([]);
    }
  });
});

/* ⚠️ One brand, several cities. The owner's own property list carries The
   Peerless Hotel in Durgapur, Hyderabad and Kolkata, and a name-only key
   rejected the second and third as copies of the first. */
describe("property duplicates", () => {
  const mapping = Object.fromEntries(HOTEL_IMPORT.fields.map((f) => [f.key, f.label]));
  const peerless = (city: string) => ({
    "Property Name": "THE PEERLESS HOTEL", City: city, State: "West Bengal",
  });
  const [nameKey] = HOTEL_IMPORT.duplicateKeys;

  it("accepts the same property name in different cities", () => {
    const rows = validateRows(
      [peerless("Durgapur "), peerless("Hyderabad "), peerless("Kolkata ")],
      mapping, HOTEL_IMPORT,
    );
    expect(rows.map((r) => r.errors)).toEqual([[], [], []]);
  });

  it("still rejects the same property twice in one city", () => {
    const rows = validateRows(
      [peerless("Kolkata"), { ...peerless(" kolkata "), "Property Name": "The  Peerless Hotel" }],
      mapping, HOTEL_IMPORT,
    );
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.errors).toEqual(["Same property name and city as row 2"]);
  });

  /* The stored side must build its key the same way, or a re-uploaded
     file stops warning that it is already in. */
  it("warns only when a stored property has the same name AND city", () => {
    const stored = { name: "The Peerless Hotel", city: "Kolkata" };
    const existing = { name: new Set([duplicateValue(nameKey!, (f) => stored[f as keyof typeof stored])]) };
    const [kolkata, durgapur] = validateRows(
      [peerless("Kolkata"), peerless("Durgapur")], mapping, HOTEL_IMPORT, existing,
    );
    expect(kolkata!.warnings).toEqual(["A record already exists with this property name and city"]);
    expect(durgapur!.warnings).toEqual([]);
  });
});

/* Fixing a rejected row on the review screen instead of re-uploading. */
describe("row edits", () => {
  const mapping = Object.fromEntries(HOTEL_IMPORT.fields.map((f) => [f.key, f.label]));
  const kalaSagar = {
    "Property Name": "HOTEL KALA SAGAR", City: "Pune", State: "Maharashtra",
    "Account Name": "KALASAGAR CHITRA MANDIR PVT LTD",
    "Account Number": "A/c No. 050329070000002", IFSC: "BKID0000503",
  };

  it("points each error at the field that caused it", () => {
    const [r] = validateRows([kalaSagar], mapping, HOTEL_IMPORT);
    expect(r!.fieldErrors).toEqual({ bankAccountNumber: "Digits only" });
    expect(r!.edited).toEqual([]);
  });

  it("re-checks the corrected value, keeps its leading zero, and imports it", () => {
    const rows = validateRows([kalaSagar], mapping, HOTEL_IMPORT, {}, {
      2: { bankAccountNumber: "050329070000002" },
    });
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.edited).toEqual(["bankAccountNumber"]);
    expect(buildDocuments(rows, HOTEL_IMPORT)[0]!.bankAccountNumber).toBe("050329070000002");
  });

  it("leaves the parsed file untouched", () => {
    const raw = { ...kalaSagar };
    validateRows([raw], mapping, HOTEL_IMPORT, {}, { 2: { bankAccountNumber: "050329070000002" } });
    expect(raw["Account Number"]).toBe("A/c No. 050329070000002");
  });

  /* A correction can create a problem as well as clear one. */
  it("judges an edited row against the rest of the file", () => {
    const other = { ...kalaSagar, "Property Name": "HOTEL SADANAND REGENCY", "Account Number": "" };
    const rows = validateRows([kalaSagar, other], mapping, HOTEL_IMPORT, {}, {
      2: { bankAccountNumber: "050329070000002" },
      3: { name: "Hotel Kala Sagar" },
    });
    expect(rows[1]!.errors).toEqual(["Same property name and city as row 2"]);
    expect(Object.keys(rows[1]!.fieldErrors).sort()).toEqual(["city", "name"]);
  });

  it("fills a column the file does not have at all", () => {
    const partial = { ...mapping, starRating: "" };
    delete (partial as Record<string, string>).starRating;
    const [r] = validateRows([kalaSagar], partial, HOTEL_IMPORT, {}, {
      2: { bankAccountNumber: "050329070000002", starRating: "4" },
    });
    expect(HOTEL_IMPORT.toDocument(r!.mapped).starRating).toBe(4);
  });
});

describe("summarise", () => {
  it("counts what will and will not be imported", () => {
    const mapping = { firstName: "A", lastName: "B", email: "C", phone: "D" };
    const rows = validateRows(
      [
        { A: "Ananya", B: "Bose", C: "a@example.com", D: "9000000001" },
        { A: "", B: "Desai", C: "b@example.com", D: "9000000002" },
      ],
      mapping,
      CUSTOMER_IMPORT,
    );

    const summary = summarise(rows);
    expect(summary.total).toBe(2);
    expect(summary.willImport).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

describe("templateCsv", () => {
  /* The template is generated from the same descriptor the importer
     validates against, so this test is really asserting that the two
     cannot drift apart. */
  it("round-trips: its own output validates cleanly", () => {
    for (const descriptor of [CUSTOMER_IMPORT, COMPANY_IMPORT]) {
      const csv = templateCsv(descriptor);
      const [headerLine] = csv.split("\n");
      const headers = headerLine!.split(",").map((h) => h.replace(/^"|"$/g, "").trim());

      const mapping = guessMapping(headers, descriptor);
      const rows = validateRows(descriptor.samples, mapping, descriptor);

      for (const row of rows) {
        expect(row.errors, `${descriptor.label} sample row ${row.rowNumber}`).toEqual([]);
      }
    }
  });

  it("includes every required column", () => {
    const csv = templateCsv(CUSTOMER_IMPORT);
    for (const field of CUSTOMER_IMPORT.fields.filter((f) => f.required)) {
      expect(csv).toContain(field.label);
    }
  });
});

/* ── Which imports can be tagged to a salesperson ─────────────────
   ⚠️ ownerId scopes a salesperson's list for customers and companies
   and scopes nothing for properties, which every role reads. Offering
   "belongs to Haider" on a property import would be a control that
   changes nothing. */
describe("ownable imports", () => {
  it("lets customers and companies be tagged to a person", async () => {
    const { CUSTOMER_IMPORT, COMPANY_IMPORT } = await import("./descriptors");
    expect(CUSTOMER_IMPORT.ownable).toBe(true);
    expect(COMPANY_IMPORT.ownable).toBe(true);
  });

  it("does not offer tagging on properties", () => {
    expect(HOTEL_IMPORT.ownable).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════
   THE OWNER'S COMPANY LIST

   Pinned to the exact headers of the sheet the owner holds:

     SR. NO. | COMPANY NAME | CITY | CONTACT PERSON | DESIGNATION |
     CONTACT NUMBER | EMAIL ID | STATUS

   Before this, that sheet lost the contact person to a list no screen
   read, dropped CONTACT NUMBER as unrecognised, had nowhere to put
   DESIGNATION, and rejected any row with a blank city or a status word
   other than active / prospect / dormant.
   ══════════════════════════════════════════════════════════════════ */

const OWNER_HEADERS = [
  "SR. NO.", "COMPANY NAME", "CITY", "CONTACT PERSON", "DESIGNATION",
  "CONTACT NUMBER", "EMAIL ID", "STATUS",
];

const sheetRow = (cells: Partial<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(OWNER_HEADERS.map((h) => [h, cells[h] ?? ""]));

function importSheet(rows: Record<string, string>[]) {
  const mapping = guessMapping(OWNER_HEADERS, COMPANY_IMPORT);
  const validated = validateRows(rows, mapping, COMPANY_IMPORT);
  return {
    mapping, validated,
    summary: summarise(validated),
    docs: buildDocuments(validated, COMPANY_IMPORT),
  };
}

describe("the owner's company sheet", () => {
  it("maps every column on its own, and leaves SR. NO. alone", () => {
    const mapping = guessMapping(OWNER_HEADERS, COMPANY_IMPORT);
    expect(mapping).toMatchObject({
      name: "COMPANY NAME",
      city: "CITY",
      contactPerson: "CONTACT PERSON",
      designation: "DESIGNATION",
      contactPhone: "CONTACT NUMBER",
      contactEmail: "EMAIL ID",
      status: "STATUS",
    });
    expect(Object.values(mapping)).not.toContain("SR. NO.");
  });

  /* The owner's rule: company name is what matters, everything else may
     or may not be filled in. */
  it("imports a row that has nothing but a company name", () => {
    const { validated, docs } = importSheet([sheetRow({ "COMPANY NAME": "Orbit Pharma" })]);
    expect(validated[0]!.errors).toEqual([]);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      name: "Orbit Pharma", legalName: "Orbit Pharma", city: "", contacts: [],
    });
  });

  it("rejects a row with no company name, and only that", () => {
    const { validated } = importSheet([sheetRow({ "CONTACT PERSON": "Someone" })]);
    expect(validated[0]!.errors).toEqual(["Company Name is required"]);
  });

  it("stores the contact person on the company, with all their details", () => {
    const { docs } = importSheet([sheetRow({
      "SR. NO.": "1", "COMPANY NAME": "Meridian Logistics", CITY: "Pune",
      "CONTACT PERSON": "Rohan Kulkarni", DESIGNATION: "Travel Desk Head",
      "CONTACT NUMBER": "98765 43210", "EMAIL ID": "Rohan@Meridian.com", STATUS: "Active",
    })]);
    expect(docs[0]).toMatchObject({
      name: "Meridian Logistics", city: "Pune", status: "active",
      contacts: [{
        name: "Rohan Kulkarni", designation: "Travel Desk Head",
        phone: "98765 43210", email: "rohan@meridian.com",
      }],
    });
  });

  /* ⚠️ The company is the point. A short phone number or a mistyped email
     must not cost the company. */
  it("warns, and does not reject, on a bad phone or email, keeping what was typed", () => {
    const { validated, docs } = importSheet([sheetRow({
      "COMPANY NAME": "Hotel Sai", "CONTACT PERSON": "Sunil",
      "CONTACT NUMBER": "98765", "EMAIL ID": "sunil@",
    })]);
    expect(validated[0]!.errors).toEqual([]);
    expect(validated[0]!.warnings.join(" ")).toMatch(/Contact Number/);
    expect(validated[0]!.warnings.join(" ")).toMatch(/Email ID/);
    expect((docs[0]!.contacts as { phone: string }[])[0]!.phone).toBe("98765");
  });

  it("turns the same company on several rows into one company with several contacts", () => {
    const { validated, summary, docs } = importSheet([
      sheetRow({ "COMPANY NAME": "Tata Motors", CITY: "Pune", "CONTACT PERSON": "Asha", "CONTACT NUMBER": "9800000001" }),
      sheetRow({ "COMPANY NAME": "Infosys", CITY: "Pune", "CONTACT PERSON": "Ravi" }),
      sheetRow({ "COMPANY NAME": "  tata motors ", CITY: "Pune", "CONTACT PERSON": "Karan", "CONTACT NUMBER": "9800000002" }),
    ]);

    expect(validated.every((r) => r.errors.length === 0)).toBe(true);
    expect(validated[2]!.mergedInto).toBe(2);
    expect(validated[2]!.notes[0]).toMatch(/Combined with row 2/);
    expect(summary).toMatchObject({ total: 3, willImport: 2, combined: 1, skipped: 0 });

    expect(docs).toHaveLength(2);
    const tata = docs.find((d) => d.name === "Tata Motors")!;
    expect((tata.contacts as { name: string }[]).map((c) => c.name)).toEqual(["Asha", "Karan"]);
  });

  it("combines but warns when the same company lists two different cities", () => {
    const { validated, docs } = importSheet([
      sheetRow({ "COMPANY NAME": "Hotel Sai", CITY: "Pune", "CONTACT PERSON": "A" }),
      sheetRow({ "COMPANY NAME": "Hotel Sai", CITY: "Nashik", "CONTACT PERSON": "B" }),
    ]);
    expect(docs).toHaveLength(1);
    expect(validated[1]!.warnings.join(" ")).toMatch(/City differs from row 2/);
  });

  it("does not list the same person twice", () => {
    const { docs } = importSheet([
      sheetRow({ "COMPANY NAME": "Acme", "CONTACT PERSON": "Asha", "CONTACT NUMBER": "9800000001" }),
      sheetRow({ "COMPANY NAME": "Acme", "CONTACT PERSON": "asha", "CONTACT NUMBER": "98000 00001" }),
    ]);
    expect(docs[0]!.contacts).toHaveLength(1);
  });

  /* The Details filter reads these — an imported company must arrive
     already tagged, not wait for a backfill. */
  it("tags each imported company with the details it has", () => {
    const { docs } = importSheet([
      sheetRow({ "COMPANY NAME": "Full Co", CITY: "Pune", "CONTACT PERSON": "A", "CONTACT NUMBER": "9800000001", "EMAIL ID": "a@x.com" }),
      sheetRow({ "COMPANY NAME": "Bare Co" }),
    ]);
    expect(docs[0]!.detailTags).toEqual(["has:contact", "has:phone", "has:email", "has:city"]);
    expect(docs[1]!.detailTags).toEqual(["no:contact", "no:phone", "no:email", "no:city"]);
  });

  /* A number with no name has nobody to belong to. It goes on the
     company's own line rather than on a nameless contact. */
  it("puts a number with no contact name on the company itself", () => {
    const { docs } = importSheet([sheetRow({ "COMPANY NAME": "Acme", "CONTACT NUMBER": "02048901200" })]);
    expect(docs[0]).toMatchObject({ phone: "02048901200", contacts: [] });
  });

  /* ⚠️ If the first row for a company is rejected, the next one becomes
     the company, rather than being folded into a row never written. */
  it("lets a later row stand in for a rejected first row", () => {
    const mapping = { ...guessMapping(OWNER_HEADERS, COMPANY_IMPORT), gstin: "GST" };
    const rows = [
      { ...sheetRow({ "COMPANY NAME": "Acme", "CONTACT PERSON": "First" }), GST: "not-a-gstin" },
      { ...sheetRow({ "COMPANY NAME": "Acme", "CONTACT PERSON": "Second" }), GST: "" },
    ];
    const validated = validateRows(rows, mapping, COMPANY_IMPORT);
    expect(validated[0]!.errors.length).toBeGreaterThan(0);
    expect(validated[1]!.errors).toEqual([]);
    expect(validated[1]!.mergedInto).toBeUndefined();
    const docs = buildDocuments(validated, COMPANY_IMPORT);
    expect((docs[0]!.contacts as { name: string }[])[0]!.name).toBe("Second");
  });
});

describe("status words from a lead sheet", () => {
  it("understands the words people actually use", () => {
    expect(companyStatusFor("Active")).toBe("active");
    expect(companyStatusFor("Follow up")).toBe("prospect");
    expect(companyStatusFor("follow-up")).toBe("prospect");
    expect(companyStatusFor("Interested")).toBe("prospect");
    expect(companyStatusFor("NOT INTERESTED")).toBe("dormant");
    expect(companyStatusFor("Not Interested")).toBe("dormant");
    expect(companyStatusFor("Something new")).toBe("prospect");
    expect(companyStatusFor("")).toBe("prospect");
  });

  /* ⚠️ "Interested" and "Follow up" both become prospect, and the
     difference is exactly what the salesperson needs, so it is kept. */
  it("keeps the original word in the notes, and warns only on words it does not know", () => {
    const { validated, docs } = importSheet([
      sheetRow({ "COMPANY NAME": "A Co", STATUS: "Follow up" }),
      sheetRow({ "COMPANY NAME": "B Co", STATUS: "Call after Diwali" }),
      sheetRow({ "COMPANY NAME": "C Co", STATUS: "prospect" }),
    ]);
    expect(validated[0]!.warnings).toEqual([]);
    expect(docs[0]!.notes).toMatch(/Follow up/);

    expect(validated[1]!.errors).toEqual([]);
    expect(validated[1]!.warnings.join(" ")).toMatch(/Call after Diwali/);
    expect(docs[1]).toMatchObject({ status: "prospect" });
    expect(docs[1]!.notes).toMatch(/Call after Diwali/);

    expect(docs[2]!.notes).toBe("");
  });
});

/* Room types: lenient numbers, matched to a property, updated on re-upload. */
describe("room type import", () => {
  const mapping = Object.fromEntries(ROOM_TYPE_IMPORT.fields.map((f) => [f.key, f.label]));
  const hotels = [
    { id: "h1", name: "THE PEERLESS HOTEL", city: "Durgapur" },
    { id: "h2", name: "THE PEERLESS HOTEL", city: "Hyderabad" },
    { id: "h3", name: "THE PEERLESS HOTEL", city: "Kolkata" },
    { id: "h4", name: "BNGV THE GRANDEUR HOTEL\u00a0AND\u00a0BANQUETS", city: "BENGALURU" },
    { id: "h5", name: "Hotel Centre Point", city: "Solapur" },
  ];
  const ctx = { hotels, roomTypes: [{ id: "r1", hotelId: "h3", name: "Club Room" }] };
  const room = (over: Record<string, string> = {}) => ({
    "Property Name": "THE PEERLESS HOTEL", City: "Kolkata", "Room Type": "Superior Room",
    "Total Rooms": "58", ...over,
  });
  const check = (over: Record<string, string> = {}) =>
    validateRows([room(over)], mapping, ROOM_TYPE_IMPORT, {}, {}, ctx)[0]!;

  it("finds the right one of three same-named properties by city", () => {
    const r = check();
    expect(r.errors).toEqual([]);
    expect(ROOM_TYPE_IMPORT.toDocument(r.mapped, ctx)).toMatchObject({
      hotelId: "h3", hotelName: "THE PEERLESS HOTEL", name: "Superior Room", totalRooms: 58,
    });
  });

  it("refuses to guess between same-named properties when the city is missing", () => {
    expect(check({ City: "" }).errors.join(" ")).toContain("3 properties are called");
  });

  it("matches through non-breaking spaces and a decorated name, with a warning for the latter", () => {
    expect(check({ "Property Name": "BNGV THE GRANDEUR HOTEL AND BANQUETS", City: "Bengaluru" }).errors)
      .toEqual([]);
    const loose = check({ "Property Name": "Centre Point", City: "Solapur" });
    expect(loose.errors).toEqual([]);
    expect(loose.warnings.join(" ")).toContain("by a similar name");
  });

  it("rejects a row whose property is not in the system, and points at the name", () => {
    const r = check({ "Property Name": "HOTEL SILVER CREST", City: "Pune" });
    expect(r.errors.join(" ")).toContain("Import it as a property first");
    expect(Object.keys(r.fieldErrors)).toEqual(["hotelName"]);
  });

  /* "Don't make it strict": numbers are read out of their surroundings. */
  it("reads numbers leniently and never rejects a row over one", () => {
    const r = check({ "Total Rooms": "12 ROOMS", "Max Occupancy": "2 to 4", "Size (sq ft)": "1,150 sq ft" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      "Total Rooms: Read as 12", "Max Occupancy: Read as 4", "Size (sq ft): Read as 1150",
    ]);
    expect(ROOM_TYPE_IMPORT.toDocument(r.mapped, ctx)).toMatchObject({
      totalRooms: 12, maxOccupancy: 4, sizeSqft: 1150,
    });
    const na = check({ "Total Rooms": "NA" });
    expect(na.errors).toEqual([]);
    expect(na.warnings).toEqual(["Total Rooms: Not a number, so it is left blank"]);
  });

  /* An update must not blank what the sheet left empty. */
  it("leaves out blank numbers, so uploading again never wipes a stored count", () => {
    const doc = ROOM_TYPE_IMPORT.toDocument(check({ "Total Rooms": "" }).mapped, ctx);
    expect(doc).not.toHaveProperty("totalRooms");
    expect(doc).not.toHaveProperty("sizeSqft");
    expect(doc).not.toHaveProperty("code");
  });

  it("says whether a row adds a room type or updates one", () => {
    expect(check().notes).toEqual(["New room type"]);
    expect(check({ "Room Type": "club room" }).notes)
      .toEqual(["Updates the room type already on this property"]);
  });

  it("rejects the same room type twice for one property, but not across properties", () => {
    const rows = validateRows(
      [room(), room({ "Room Type": "SUPERIOR  ROOM" }), room({ City: "Hyderabad" })],
      mapping, ROOM_TYPE_IMPORT, {}, {}, ctx,
    );
    expect(rows[1]!.errors).toEqual(["Same room type for this property as row 2"]);
    expect(rows[2]!.errors).toEqual([]);
  });

  it("validates its own template samples against a matching property list", () => {
    const own = { hotels: [
      { id: "a", name: "Ayati Resort & Spa", city: "Mahabaleshwar" },
      { id: "p", name: "The Peerless Hotel", city: "Kolkata" },
    ] };
    for (const r of validateRows(ROOM_TYPE_IMPORT.samples, mapping, ROOM_TYPE_IMPORT, {}, {}, own)) {
      expect(r.errors).toEqual([]);
    }
  });
});

/* ⚠️ A workbook that opens on a "Read me" tab had its instructions
   validated as data: every line rejected, nothing imported. */
describe("choosing the sheet in a workbook", () => {
  it("reads the sheet whose headings match, not simply the first", async () => {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Room types for audit"], ["Check the blue numbers."]]), "Read me");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["Property Name", "City", "Room Type", "Total Rooms", "Source"],
      ["The Peerless Hotel", "Kolkata", "Club Room", "25", "peerlesshotels.com"],
    ]), "Room types");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const parsed = await parseFile(new File([bytes], "rooms.xlsx"), undefined, ROOM_TYPE_IMPORT);
    expect(parsed.activeSheet).toBe("Room types");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!["Room Type"]).toBe("Club Room");
  });
});
