// Money (CLAUDE.md conventions): stored as integer paise, shown in Indian format. Client-safe.

const RUPEE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const RUPEE_EXACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "₹12,34,567" (paise shown only when there are any, e.g. "₹1,250.50"). */
export function formatRupees(paise: number): string {
  return paise % 100 === 0 ? RUPEE.format(paise / 100) : RUPEE_EXACT.format(paise / 100);
}

/**
 * Paise from what someone typed in rupees: "12,34,567", "₹ 50000", "1250.5". `null` when it
 * isn't an amount (or has more than 2 decimals).
 */
export function parseRupees(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [rupees, decimals = ''] = cleaned.split('.');
  return Number(rupees) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Paise as a plain rupee string for a form field: 1250050 → "12500.5". */
export function rupeesInput(paise: number | null): string {
  if (paise === null) return '';
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0
    ? String(rupees)
    : `${rupees}.${String(rest).padStart(2, '0').replace(/0$/, '')}`;
}
