import { parseCsv } from '@/shared/csv';

export const IMPORT_FIELDS = [
  ['displayName', 'Family name (required)'],
  ['members', 'Member names'],
  ['headcount', 'Headcount'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['side', 'Side'],
  ['tags', 'Tags'],
  ['notes', 'Notes'],
  ['eventIds', 'Invited events'],
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number][0];
export type ColumnMapping = Partial<Record<ImportField, number>>;
export interface GuestFile {
  headers: string[];
  rows: string[][];
}

export async function readGuestFile(file: File): Promise<GuestFile> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a file smaller than 5 MB.');
  let grid: string[][];
  if (/\.csv$/i.test(file.name)) grid = parseCsv(await file.text());
  else if (/\.xlsx$/i.test(file.name)) {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('This workbook has no worksheets.');
    if (sheet.rowCount > 1001) throw new Error('Import at most 1,000 families at a time.');
    if (sheet.columnCount > 100) throw new Error('Use at most 100 columns.');
    grid = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      for (let i = 1; i <= Math.min(sheet.columnCount, 100); i++) {
        const cell = row.getCell(i);
        values.push(cell.text);
      }
      if (values.some((v) => v.trim())) grid.push(values);
    });
  } else
    throw new Error('Choose a CSV or .xlsx file. Older .xls files must be saved as .xlsx or CSV.');
  const [headers, ...rows] = grid;
  if (!headers?.length || !rows.length)
    throw new Error('Include a header row and at least one family.');
  if (headers.length > 100) throw new Error('Use at most 100 columns.');
  if (rows.length > 1000) throw new Error('Import at most 1,000 families at a time.');
  if (rows.some((row) => row.length > headers.length))
    throw new Error('Some rows have more columns than the header. Check the CSV separators.');
  return { headers, rows };
}

export function guessMapping(headers: string[]): ColumnMapping {
  const aliases: Record<ImportField, string[]> = {
    displayName: ['displayname', 'familyname', 'family', 'household'],
    members: ['members', 'membernames'],
    headcount: ['headcount', 'people', 'totalpeople'],
    email: ['email'],
    phone: ['phone', 'mobile', 'phonenumber'],
    side: ['side'],
    tags: ['tags'],
    notes: ['notes'],
    eventIds: ['eventids', 'events', 'inviteto'],
  };
  const mapping: ColumnMapping = {};
  for (const [field] of IMPORT_FIELDS) {
    const index = headers.findIndex((header) =>
      aliases[field].includes(header.toLowerCase().replace(/[^a-z]/g, '')),
    );
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

export function mapGuestRows(
  file: GuestFile,
  mapping: ColumnMapping,
  events: { id: string; name: string }[],
  fixedSide: string | null,
) {
  return file.rows.map((row) => {
    const cell = (field: ImportField) => {
      const index = mapping[field];
      // CSV exports protect formula-looking text with an apostrophe; restore the original value.
      return (index === undefined ? '' : (row[index] ?? '')).trim().replace(/^'(?=[=+@-])/, '');
    };
    const split = (field: ImportField) =>
      cell(field)
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean);
    const side = cell('side')
      .toLowerCase()
      .replace(/\s+side$/, '');
    return {
      displayName: cell('displayName'),
      members: split('members'),
      ...(cell('headcount') ? { headcount: Number(cell('headcount')) } : {}),
      email: cell('email'),
      phone: cell('phone'),
      side: side || fixedSide || null,
      tags: split('tags'),
      notes: cell('notes'),
      eventIds: split('eventIds').map((value) => {
        const matches = events.filter(
          (event) => event.id === value || event.name.toLowerCase() === value.toLowerCase(),
        );
        return matches.length === 1 ? matches[0]!.id : value;
      }),
    };
  });
}
