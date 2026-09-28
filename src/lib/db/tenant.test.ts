import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { trustWeddingId } from '@/lib/ids';
import { assertUpdateKeepsTenant, tenantFilter } from './tenant';

const weddingA = trustWeddingId(new ObjectId());
const weddingB = new ObjectId();

describe('tenantFilter', () => {
  it('adds weddingId to an empty filter', () => {
    expect(tenantFilter(weddingA)).toEqual({ weddingId: weddingA });
  });

  it('keeps other conditions', () => {
    const id = new ObjectId();
    expect(tenantFilter(weddingA, { _id: id })).toEqual({ _id: id, weddingId: weddingA });
  });

  it("can't be overridden by a caller-supplied weddingId", () => {
    expect(tenantFilter(weddingA, { weddingId: weddingB })).toEqual({ weddingId: weddingA });
  });
});

describe('assertUpdateKeepsTenant', () => {
  it('allows ordinary updates', () => {
    expect(() =>
      assertUpdateKeepsTenant({ $set: { name: 'x' }, $inc: { count: 1 } }),
    ).not.toThrow();
    expect(() => assertUpdateKeepsTenant([{ $set: { rsvps: [] } }])).not.toThrow();
  });

  it.each([
    [{ $set: { weddingId: weddingB } }],
    [{ $unset: { weddingId: '' } }],
    [{ $rename: { weddingId: 'oldWeddingId' } }],
    [{ $rename: { other: 'weddingId' } }],
    [{ $setOnInsert: { 'weddingId.x': 1 } }],
    [[{ $set: { weddingId: weddingB } }]],
    [[{ $unset: 'weddingId' }]],
    [[{ $unset: ['a', 'weddingId'] }]],
    [[{ $replaceWith: { a: 1 } }]],
  ])('rejects %j', (update) => {
    expect(() => assertUpdateKeepsTenant(update)).toThrow(/Tenant update/);
  });
});
