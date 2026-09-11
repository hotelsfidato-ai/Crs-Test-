/**
 * An initials-style code for a room type ("Deluxe Room with Balcony" → "DRWB"),
 * so the code column is never blank.
 *
 * Shared by the room type form and the room type import, so a room typed in
 * by hand and the same room uploaded from a sheet get the same code.
 */
export function roomCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "STD";
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}
