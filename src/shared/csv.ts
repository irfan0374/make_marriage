/** CSV cells are quoted, with spreadsheet formulas treated as literal text. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function makeCsv(rows: unknown[][]): string {
  return '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180-style CSV, including quoted commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\ufeff/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const push = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed)
        throw new Error('Unexpected quote in CSV. Use double quotes around the whole cell.');
      quoted = true;
    } else if (c === ',') push();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      push();
      rows.push(row);
      row = [];
    } else {
      if (closed && c.trim()) throw new Error('Unexpected text after a quoted CSV cell.');
      if (!closed) cell += c;
    }
  }
  if (quoted) throw new Error('An opening CSV quote has no closing quote.');
  if (cell || row.length || closed) {
    push();
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}
