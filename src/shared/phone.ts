// Phone numbers are stored as +<digits> (households.schemas `normalizePhone`). Client-safe.

/** "+919876543210" → "+91 98765 43210"; other numbers are shown as stored. */
export function formatPhone(phone: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return india ? `+91 ${india[1]} ${india[2]}` : phone;
}
