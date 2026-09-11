/* ══════════════════════════════════════════════════════════════════
   COMPANY NAME KEY

   One normalised form of a company's name, stored on every company as
   `nameKey`, used for two things:

     · search as you type — a prefix match in the database, bounded,
       instead of reading every company into the browser
     · recognising a company already on file when a salesperson logs a
       visit, so "Varun Beverages Ltd" and "VARUN BEVERAGES LIMITED" link
       to one record rather than creating a second

   ⚠️ Learned from a real DSR, where the same company arrived as
   "SM ELECTRONIC TECHNOLOGIES PTVT. LTD." one day and "…PVT. LTD." the
   next. Case, punctuation and the legal suffix are normalised away.
   A TYPO is not — "ptvt" is not a legal form, so those two keys differ.
   What catches a typo is the search: typing "sm elec" lists both, and
   the salesperson picks the existing one. Matching is a convenience,
   not a guarantee against duplicates.

   ⚠️ Derived — only ever set from `companyNameKey`. A company saved
   before the field existed is found by neither search nor matching until
   `npm run backfill:tags` runs.
   ══════════════════════════════════════════════════════════════════ */

/**
 * Legal-form words that vary between writings of one company and say
 * nothing about which company it is.
 *
 * ⚠️ NOT "india", "group" or "technologies" — those tell companies apart.
 * "ABB India" and "ABB Robotics India" are two different visits in the
 * DSR that prompted this, and stripping more would merge them.
 */
const LEGAL_FORMS = new Set([
  "pvt", "pvtltd", "private", "ltd", "limited", "llp", "inc", "incorporated",
  "corp", "corporation", "co", "company", "plc", "opc",
]);

/** "SM Electronic Technologies Pvt. Ltd." → "sm electronic technologies" */
export function companyNameKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  // Strip legal forms from the END only — "Company Secretaries LLP" keeps
  // its first word.
  while (words.length > 1 && LEGAL_FORMS.has(words[words.length - 1]!)) words.pop();
  if (words[0] === "the" && words.length > 1) words.shift();
  return words.join(" ");
}

/**
 * The upper bound for a prefix search on `nameKey`: every key starting
 * with "sm e" sorts between "sm e" and "sm e" + this.
 *
 * ⚠️ Written as an escape on purpose — the character is invisible, and a
 * literal one reads as an empty string, inviting someone to "fix" it.
 */
export const PREFIX_END = "\uf8ff";
