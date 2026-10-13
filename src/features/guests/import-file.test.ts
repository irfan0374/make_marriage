import { describe, expect, it } from 'vitest';
import { guessMapping, mapGuestRows, readGuestFile } from './import-file';

describe('guest import mapping', () => {
  it('maps column aliases and semicolon lists, matching only unambiguous event names', () => {
    const headers = ['Family name', 'Members', 'People', 'Phone', 'Events', 'Tags'];
    const file = {
      headers,
      rows: [
        ['Khan family', 'Anu; Ravi', '2', "'+919876543210", 'Haldi; ambiguous', 'VIP; Family'],
      ],
    };
    expect(
      mapGuestRows(
        file,
        guessMapping(headers),
        [
          { id: 'a', name: 'Haldi' },
          { id: 'b', name: 'ambiguous' },
          { id: 'c', name: 'ambiguous' },
        ],
        'groom',
      )[0],
    ).toMatchObject({
      displayName: 'Khan family',
      members: ['Anu', 'Ravi'],
      headcount: 2,
      phone: '+919876543210',
      eventIds: ['a', 'ambiguous'],
      side: 'groom',
    });
  });
  it('does not silently move opposite-side families into a scoped manager’s side', () => {
    expect(
      mapGuestRows(
        { headers: ['family', 'side'], rows: [['Khan', 'bride']] },
        { displayName: 0, side: 1 },
        [],
        'groom',
      )[0]?.side,
    ).toBe('bride');
  });
  it('reads CSV and rejects unsupported, empty and oversized files', async () => {
    expect(
      (await readGuestFile(new File(['Family,Members\nKhan,"Anu; Ravi"'], 'guests.csv'))).rows,
    ).toEqual([['Khan', 'Anu; Ravi']]);
    await expect(readGuestFile(new File(['Family\n'], 'empty.csv'))).rejects.toThrow();
    await expect(readGuestFile(new File(['data'], 'guests.xls'))).rejects.toThrow();
    await expect(
      readGuestFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.csv')),
    ).rejects.toThrow();
  });
});

describe('Excel guest files', () => {
  it('reads the first worksheet without evaluating formulas or importing another sheet', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Guests');
    sheet.addRow(['displayName', 'members', 'phone']);
    sheet.addRow(['Excel family', 'Anu; Ravi', '+919876543210']);
    workbook.addWorksheet('Other').addRow(['Do not import']);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([new Uint8Array(buffer)], 'guests.xlsx');
    expect(await readGuestFile(file)).toEqual({
      headers: ['displayName', 'members', 'phone'],
      rows: [['Excel family', 'Anu; Ravi', '+919876543210']],
    });
  });
});
