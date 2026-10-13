import { describe, expect, it } from 'vitest';
import { makeCsv, parseCsv } from './csv';

describe('guest CSV files', () => {
  it('reads quoted commas, escaped quotes, BOM and multiline values', () => {
    expect(parseCsv('\ufeffname,notes\r\n"Sharma, family","Line 1\nLine ""2"""\r\n')).toEqual([
      ['name', 'notes'],
      ['Sharma, family', 'Line 1\nLine "2"'],
    ]);
  });
  it('keeps trailing empty fields and rejects broken quoting', () => {
    expect(parseCsv('a,b,c\n1,2,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', ''],
    ]);
    expect(() => parseCsv('a\n"unfinished')).toThrow();
    expect(() => parseCsv('a\n"ok"bad')).toThrow();
  });
  it('protects spreadsheet formulas, quotes text and does not expose executable cells', () => {
    const rows = parseCsv(
      makeCsv([['=HYPERLINK("https://example.com")', '+919876543210', 'A,B', 'two\nlines']]),
    );
    expect(rows[0]).toEqual([
      '\'=HYPERLINK("https://example.com")',
      "'+919876543210",
      'A,B',
      'two\nlines',
    ]);
  });
});
