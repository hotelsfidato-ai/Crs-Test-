import { describe, expect, it } from "vitest";
import { guessMapping, validateRows, summarise, templateCsv } from "./engine";
import { CUSTOMER_IMPORT, COMPANY_IMPORT, HOTEL_IMPORT } from "./descriptors";

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
