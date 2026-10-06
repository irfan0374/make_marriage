import { describe, expect, it } from 'vitest';
import { authHref, safeNextPath } from './next-path';

const token = 'A'.repeat(43);

describe('safeNextPath', () => {
  it('allows app pages and invite links', () => {
    expect(safeNextPath('/app')).toBe('/app');
    expect(safeNextPath('/app/66f1b0000000000000000001/team')).toBe(
      '/app/66f1b0000000000000000001/team',
    );
    expect(safeNextPath(`/join/${token}`)).toBe(`/join/${token}`);
  });

  it('refuses other sites and anything unexpected', () => {
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      '/app?x=1',
      '/settings',
      `/join/${token}/../../x`,
      '',
      null,
      undefined,
      ['/app'],
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });
});

describe('authHref', () => {
  it('keeps next and the email to fill in', () => {
    expect(authHref('/signup', `/join/${token}`, 'a@example.com')).toBe(
      `/signup?next=%2Fjoin%2F${token}&email=a%40example.com`,
    );
    expect(authHref('/login', null)).toBe('/login');
  });
});
