import { describe, expect, it } from "vitest";
import { companyDetailTags, COMPANY_DETAIL_OPTIONS } from "./companyDetails";

/* ══════════════════════════════════════════════════════════════════
   COMPANY DETAIL TAGS

   The Details filter searches these, so a wrong tag is a company that
   silently vanishes from — or wrongly appears in — "No contact number".
   ══════════════════════════════════════════════════════════════════ */

describe("companyDetailTags", () => {
  it("tags a company that has nothing but a name as missing everything", () => {
    expect(companyDetailTags({ city: "", phone: "", email: "", contacts: [] }))
      .toEqual(["no:contact", "no:phone", "no:email", "no:city"]);
  });

  it("tags a fully filled company as having everything", () => {
    expect(companyDetailTags({
      city: "Pune", contacts: [{ name: "Rohan", phone: "9876500001", email: "r@x.com" }],
    })).toEqual(["has:contact", "has:phone", "has:email", "has:city"]);
  });

  /* ⚠️ "Has a contact number" means anyone to ring about this lead — the
     company's own line counts as much as a contact person's. */
  it("counts the company's own phone and email, not only a contact's", () => {
    const tags = companyDetailTags({ phone: "02048901200", email: "accounts@x.com", contacts: [] });
    expect(tags).toContain("has:phone");
    expect(tags).toContain("has:email");
    expect(tags).toContain("no:contact");
  });

  it("finds a number on any contact, not just the first", () => {
    const tags = companyDetailTags({
      contacts: [{ name: "A", phone: "" }, { name: "B", phone: "9800000002" }],
    });
    expect(tags).toContain("has:phone");
  });

  /* Whitespace is what a spreadsheet leaves in an "empty" cell. */
  it("treats a cell holding only spaces as empty", () => {
    expect(companyDetailTags({ city: "   ", phone: " ", contacts: [{ name: "  " }] }))
      .toEqual(["no:contact", "no:phone", "no:email", "no:city"]);
  });

  it("gives exactly one has: or no: tag per detail — never both, never neither", () => {
    const tags = companyDetailTags({ city: "Pune" });
    for (const key of ["contact", "phone", "email", "city"]) {
      const matching = tags.filter((t) => t.endsWith(`:${key}`));
      expect(matching, key).toHaveLength(1);
    }
  });

  it("tolerates a company saved before contacts existed", () => {
    expect(() => companyDetailTags({ city: "Pune" })).not.toThrow();
  });
});

describe("the Details filter's options", () => {
  /* Every option must be a tag companyDetailTags can actually produce, or
     choosing it would always return an empty list. */
  it("offers only values the tags can hold", () => {
    const possible = new Set([
      ...companyDetailTags({}),
      ...companyDetailTags({ city: "x", phone: "x", email: "x", contacts: [{ name: "x" }] }),
    ]);
    for (const option of COMPANY_DETAIL_OPTIONS) {
      expect(possible.has(option.value), option.value).toBe(true);
    }
    expect(COMPANY_DETAIL_OPTIONS).toHaveLength(8);
  });
});
