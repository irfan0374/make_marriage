import { describe, expect, it } from 'vitest';
import {
  isReservedSlug,
  SLUG_MAX,
  SLUG_PATTERN,
  slugify,
  slugWithSuffix,
  suggestSlug,
} from './slug';

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('  Nafiya  Begum! ')).toBe('nafiya-begum');
    expect(slugify("D'Souza--Pereira")).toBe('d-souza-pereira');
  });

  it('drops accents and removes characters it cannot spell in ASCII', () => {
    expect(slugify('Zoë')).toBe('zoe');
    expect(slugify('प्रिया')).toBe('');
  });
});

describe('suggestSlug', () => {
  it('builds {bride}-{groom}-{dd}-{mon}-{yyyy}', () => {
    expect(suggestSlug('Nafiya', 'Irfan', '2028-04-14')).toBe('nafiya-irfan-14-apr-2028');
    expect(suggestSlug('Riya', 'Arjun', '2027-01-05')).toBe('riya-arjun-05-jan-2027');
  });

  it('falls back to "wedding" when no name can be spelled', () => {
    expect(suggestSlug('प्रिया', 'अर्जुन', '2027-12-01')).toBe('wedding-01-dec-2027');
    expect(suggestSlug('प्रिया', 'Arjun', '2027-12-01')).toBe('arjun-01-dec-2027');
  });

  it('keeps long names within the limit, with room for a suffix', () => {
    const slug = suggestSlug('A'.repeat(60), 'B'.repeat(60), '2028-04-14');
    expect(slug).toMatch(SLUG_PATTERN);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX - 3);
    expect(slug.endsWith('-14-apr-2028')).toBe(true);
  });
});

describe('slugWithSuffix', () => {
  it('adds -N and stays within the limit', () => {
    expect(slugWithSuffix('nafiya-irfan-14-apr-2028', 2)).toBe('nafiya-irfan-14-apr-2028-2');
    const long = slugWithSuffix('a'.repeat(SLUG_MAX), 12);
    expect(long.length).toBe(SLUG_MAX);
    expect(long).toMatch(SLUG_PATTERN);
  });
});

describe('isReservedSlug', () => {
  it('blocks app routes', () => {
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('nafiya-irfan-14-apr-2028')).toBe(false);
  });
});
