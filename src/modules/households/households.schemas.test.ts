import { describe, expect, it } from 'vitest';
import {
  importHouseholdsSchema,
  importHouseholdRowSchema,
  bulkHouseholdsSchema,
  createHouseholdSchema,
  listHouseholdsQuerySchema,
  normalizePhone,
  updateHouseholdSchema,
} from './households.schemas';

const id = '66F1B0000000000000000001';

describe('normalizePhone', () => {
  it('accepts common Indian and international formats', () => {
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
    expect(normalizePhone('(044) 2345 6789')).toBe('+04423456789');
  });

  it('rejects things that are not phone numbers', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('call me')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
  });
});

describe('createHouseholdSchema', () => {
  it('needs only a name and fills the rest', () => {
    expect(createHouseholdSchema.parse({ displayName: '  Sharma family ' })).toEqual({
      displayName: 'Sharma family',
      members: [],
      email: null,
      phone: null,
      side: null,
      tags: [],
      notes: '',
      invitedEvents: [],
    });
  });

  it('drops blank members, lowercases email, dedupes tags and event ids', () => {
    const parsed = createHouseholdSchema.parse({
      displayName: 'Sharma family',
      members: [{ name: ' Rajesh ' }, { name: '' }],
      email: ' Rajesh@Example.COM ',
      tags: ['VIP', 'vip', 'Family'],
      invitedEvents: [{ eventId: id }],
    });
    expect(parsed).toMatchObject({
      members: [{ name: 'Rajesh' }],
      email: 'rajesh@example.com',
      tags: ['vip', 'Family'],
      invitedEvents: [{ eventId: id.toLowerCase() }],
    });
    expect(
      createHouseholdSchema.safeParse({
        displayName: 'X',
        invitedEvents: [{ eventId: id }, { eventId: id.toLowerCase() }],
      }).success,
    ).toBe(false);
  });

  it('gives clear messages', () => {
    const issues = (input: object) =>
      createHouseholdSchema.safeParse(input).error?.issues.map((i) => i.message);
    expect(issues({ displayName: ' ' })).toEqual(['Enter a name for this family']);
    expect(issues({ displayName: 'X', phone: '123' })).toEqual([
      'Enter a phone number like +91 98765 43210',
    ]);
    expect(issues({ displayName: 'X', email: 'nope' })).toEqual(['Enter a valid email']);
    expect(issues({ displayName: 'X', headcount: 0 })).toEqual(['At least 1 person']);
    expect(createHouseholdSchema.safeParse({ displayName: 'X', token: 'abc' }).success).toBe(false);
  });
});

describe('updateHouseholdSchema', () => {
  it('takes any subset, with null clearing contact details', () => {
    expect(updateHouseholdSchema.parse({ email: null, phone: '' })).toEqual({
      email: null,
      phone: null,
    });
    expect(updateHouseholdSchema.safeParse({}).success).toBe(false);
  });
});

describe('listHouseholdsQuerySchema and bulkHouseholdsSchema', () => {
  it('reads filters', () => {
    expect(listHouseholdsQuerySchema.parse({ tags: 'VIP,Family', side: 'groom' })).toMatchObject({
      tags: ['VIP', 'Family'],
      side: 'groom',
      sort: 'name',
      limit: 50,
    });
    expect(listHouseholdsQuerySchema.safeParse({ inviteStatus: 'sent,lost' }).success).toBe(false);
    expect(listHouseholdsQuerySchema.safeParse({ side: 'both' }).success).toBe(false);
  });

  it('needs the right extras per bulk action', () => {
    expect(bulkHouseholdsSchema.safeParse({ action: 'delete', householdIds: [id] }).success).toBe(
      true,
    );
    expect(bulkHouseholdsSchema.safeParse({ action: 'add_tags', householdIds: [id] }).success).toBe(
      false,
    );
    expect(
      bulkHouseholdsSchema.safeParse({
        action: 'assign_events',
        householdIds: [id],
        eventIds: [id],
      }).success,
    ).toBe(true);
    expect(bulkHouseholdsSchema.safeParse({ action: 'delete', householdIds: [] }).success).toBe(
      false,
    );
  });
});

describe('guest import requests', () => {
  it('defaults to dry-run and bounds the request to 1,000 independently validated rows', () => {
    expect(importHouseholdsSchema.parse({ rows: [{}, null] })).toMatchObject({
      dryRun: true,
      createMissingTags: true,
    });
    expect(importHouseholdsSchema.safeParse({ rows: Array(1001).fill({}) }).success).toBe(false);
  });
  it('converts member strings and event IDs to the existing family schema', () => {
    expect(
      importHouseholdRowSchema.parse({
        displayName: 'Khan',
        members: [' Anu ', ' '],
        eventIds: [id],
      }),
    ).toMatchObject({ members: [{ name: 'Anu' }], invitedEvents: [{ eventId: id.toLowerCase() }] });
    expect(
      importHouseholdRowSchema.safeParse({ displayName: 'Khan', eventIds: [id, id] }).success,
    ).toBe(false);
  });
});
