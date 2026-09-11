/* ══════════════════════════════════════════════════════════════════
   WHICH DETAILS A COMPANY HAS

   Drives the Companies list's "Details" filter — "has a contact
   number", "no email" — so a lead list can be worked through (call
   everyone with a number) or cleaned up (find everyone missing one).

   ⚠️ WHY A STORED LIST OF TAGS, NOT A QUERY. Firestore cannot ask "which
   companies have no phone number" when the numbers sit inside each
   company's `contacts` array, and cannot test a string for emptiness
   across a whole collection without an inequality that fights the
   list's sort. So each company carries `detailTags` — "has:phone",
   "no:email" — written whenever it is saved or imported, and the filter
   is a single `array-contains`. One field, one index per sort.

   ⚠️ DERIVED — never edit `detailTags` by hand, and never set it from
   anywhere but `companyDetailTags`. It must be recomputed on EVERY
   write that can change a detail, or the filter quietly lies. A
   company saved before this existed has no tags at all and matches no
   Details option until `scripts/backfill-company-tags.mjs` runs.
   ══════════════════════════════════════════════════════════════════ */

export interface CompanyDetailsSource {
  city?: string;
  phone?: string;
  email?: string;
  contacts?: { name?: string; phone?: string; email?: string }[];
}

/** One detail the filter can ask about. */
interface DetailKind {
  key: string;
  /** "a contact person" — reads after "Has" and "No". */
  has: string;
  no: string;
  test: (c: CompanyDetailsSource) => boolean;
}

const filled = (v?: string) => Boolean(v && v.trim());

/**
 * ⚠️ "Has a contact number" means ANY number to ring — the company's own
 * line or any contact person's. That is the question the filter answers:
 * can somebody be phoned about this lead. Email likewise.
 */
const KINDS: DetailKind[] = [
  {
    key: "contact", has: "Has a contact person", no: "No contact person",
    test: (c) => (c.contacts ?? []).some((p) => filled(p.name)),
  },
  {
    key: "phone", has: "Has a contact number", no: "No contact number",
    test: (c) => filled(c.phone) || (c.contacts ?? []).some((p) => filled(p.phone)),
  },
  {
    key: "email", has: "Has an email", no: "No email",
    test: (c) => filled(c.email) || (c.contacts ?? []).some((p) => filled(p.email)),
  },
  {
    key: "city", has: "Has a city", no: "No city",
    test: (c) => filled(c.city),
  },
];

/** Every tag that applies — exactly one of has:/no: per detail. */
export function companyDetailTags(c: CompanyDetailsSource): string[] {
  return KINDS.map((k) => (k.test(c) ? `has:${k.key}` : `no:${k.key}`));
}

/** The Details filter's options, "has" before "no" for each detail. */
export const COMPANY_DETAIL_OPTIONS: { value: string; label: string }[] = KINDS.flatMap((k) => [
  { value: `has:${k.key}`, label: k.has },
  { value: `no:${k.key}`, label: k.no },
]);
