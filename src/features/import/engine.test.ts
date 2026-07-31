import { describe, expect, it } from "vitest";
import { guessMapping, validateRows, summarise, templateCsv } from "./engine";
import { CUSTOMER_IMPORT, COMPANY_IMPORT } from "./descriptors";

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
