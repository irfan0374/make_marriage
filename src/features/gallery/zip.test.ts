import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, makeZip } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

/** File names listed in a ZIP's central directory. */
function centralNames(zip: Uint8Array): string[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  let at = view.getUint32(end + 16, true);
  const names: string[] = [];
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const length = view.getUint16(at + 28, true);
    names.push(new TextDecoder().decode(zip.subarray(at + 46, at + 46 + length)));
    at += 46 + length;
  }
  return names;
}

describe('makeZip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('hello'))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes a ZIP that unzip reads back, with unique names', async () => {
    const zip = makeZip([
      { name: 'mehendi_0001.webp', data: bytes('first photo') },
      { name: 'mehendi_0001.webp', data: bytes('second photo') },
      { name: 'हल्दी.jpg', data: bytes('third') },
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
    const file = join(dir, 'photos.zip');
    writeFileSync(file, new Uint8Array(await zip.arrayBuffer()));
    // `unzip -t` checks every file's CRC.
    expect(execFileSync('unzip', ['-t', file]).toString()).toContain('No errors detected');
    // Names from the central directory (macOS's unzip prints UTF-8 names badly).
    expect(centralNames(new Uint8Array(await zip.arrayBuffer()))).toEqual([
      'mehendi_0001.webp',
      'mehendi_0001 (2).webp',
      'हल्दी.jpg',
    ]);
    expect(execFileSync('unzip', ['-p', file, 'mehendi_0001 (2).webp']).toString()).toBe(
      'second photo',
    );
  });
});
