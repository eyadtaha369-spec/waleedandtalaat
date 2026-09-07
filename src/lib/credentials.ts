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

/**
 * Generates a username. Arabic (or any non-Latin) name collapses
 * slugifyName() to the literal string "student" — with only a row-
 * index-derived numeric suffix distinguishing rows, meaning two
 * *separate* import sessions that happen to have a row at the same
 * position generate the exact same username, and therefore the same
 * login email, causing a real collision at account-creation time.
 * Falling back to the phone number (unique per real student, unlike
 * row position) avoids that entirely.
 */
export function generateUsername(name: string, index: number, phone?: string): string {
  const base = slugifyName(name);
  if (base !== "student") {
    const suffix = String(100 + ((index * 37) % 900));
    return `${base}${suffix}`;
  }
  const digits = (phone ?? "").replace(/\D/g, "");
  const phoneSuffix = digits.slice(-8);
  return `student${phoneSuffix || String(100 + ((index * 37) % 900))}`;
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
  { value: "70_trips", label: "70-Trip Package" },
  { value: "weekly", label: "Weekly" },
  { value: "top_student_offer", label: "Top Student Offer" },
] as const;

/** Normalizes a local Egyptian number like "01012345678" to "201012345678". */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  return digits;
}

/** Builds a wa.me link with login credentials pre-filled, ready for the admin to review and send. */
export function credentialsWhatsAppLink(opts: {
  full_name: string;
  phone: string;
  email: string;
  temp_password: string;
}): string {
  const message =
    `Hi ${opts.full_name}! Your Waleed & Talaat account is ready ✅\n` +
    `Login email: ${opts.email}\n` +
    `Password: ${opts.temp_password}\n\n` +
    `Sign in at ${typeof window !== "undefined" ? window.location.origin : ""}/auth`;
  return `https://wa.me/${toWhatsAppNumber(opts.phone)}?text=${encodeURIComponent(message)}`;
}
