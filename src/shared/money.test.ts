import { describe, expect, it } from 'vitest';
import { formatRupees, parseRupees, rupeesInput } from './money';

describe('money', () => {
  it('shows amounts in Indian format', () => {
    expect(formatRupees(123_456_700)).toBe('₹12,34,567');
    expect(formatRupees(0)).toBe('₹0');
    expect(formatRupees(125_050)).toBe('₹1,250.50');
  });

  it('reads typed rupees into paise', () => {
    expect(parseRupees('12,34,567')).toBe(123_456_700);
    expect(parseRupees('₹ 50000')).toBe(5_000_000);
    expect(parseRupees('1250.5')).toBe(125_050);
    expect(parseRupees('1250.55')).toBe(125_055);
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('12.345')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
  });

  it('turns paise back into a rupee field value', () => {
    expect(rupeesInput(null)).toBe('');
    expect(rupeesInput(15_000_000)).toBe('150000');
    expect(rupeesInput(125_050)).toBe('1250.5');
    expect(rupeesInput(125_055)).toBe('1250.55');
  });
});
