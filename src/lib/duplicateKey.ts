/**
 * What makes two import rows, or a row and a stored record, the same thing.
 *
 * Shared by the importer (rows in the file) and the repository (records
 * already stored), because the two must build the key identically: if they
 * drift, a re-uploaded file stops warning that it is already in.
 */
export interface DuplicateKey {
  /** The field that must be present for the key to count at all. */
  field: string;
  /**
   * Further fields that must ALSO match. A property name alone is not
   * unique (one brand, several cities); name and city together are.
   */
  with?: string[];
  normalise: (v: string) => string;
  /** Read in "Same {label} as row 9". */
  label: string;
}

/**
 * The normalised key for one record, or "" when its main field is blank —
 * a blank never counts as a duplicate of another blank.
 */
export function duplicateValue(
  key: DuplicateKey,
  get: (field: string) => unknown,
): string {
  const main = key.normalise(String(get(key.field) ?? ""));
  if (!main) return "";
  const rest = (key.with ?? []).map((f) => key.normalise(String(get(f) ?? "")));
  return [main, ...rest].join("|");
}
