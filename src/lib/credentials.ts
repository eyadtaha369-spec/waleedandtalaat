/** Slugifies a full name into a username base, e.g. "Ahmed Nabil" -> "ahmed.nabil" */
export function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".") || "student"
  );
}

/** Generates a unique-ish username by appending a short random suffix. */
export function generateUsername(name: string, index: number): string {
  const base = slugifyName(name);
  const suffix = String(100 + ((index * 37) % 900));
  return `${base}${suffix}`;
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Generates a random temporary password, safe to print on a handout sheet. */
export function generateTempPassword(length = 10): string {
  let out = "";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[bytes[i]! % PASSWORD_CHARS.length];
  }
  return out;
}

export const SUBSCRIPTION_TYPES = [
  { value: "full_term", label: "Full Term" },
  { value: "package", label: "70-Trip Package" },
] as const;
