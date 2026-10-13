import { describe, expect, it } from 'vitest';
import { sniffImageType } from './files.schemas';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    // RIFF, a 4-byte size, then WEBP.
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe(
      'image/webp',
    );
  });

  it('rejects anything else, whatever the file is called', () => {
    expect(sniffImageType(new TextEncoder().encode('not an image'))).toBeNull();
    // A PDF, and a RIFF file that isn't WebP (a WAV).
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(
      sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45)),
    ).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
