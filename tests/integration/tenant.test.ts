import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db/client';
import { scopedCollection, type TenantDocument } from '@/lib/db/tenant';
import { withTransaction } from '@/lib/db/transaction';
import { trustWeddingId } from '@/lib/ids';

interface Thing extends TenantDocument {
  _id?: ObjectId;
  name: string;
  count: number;
}

const COLLECTION = 'things';
const weddingA = trustWeddingId(new ObjectId());
const weddingB = trustWeddingId(new ObjectId());
const thingsA = () => scopedCollection<Thing>(COLLECTION, weddingA);
const thingsB = () => scopedCollection<Thing>(COLLECTION, weddingB);

describe('scopedCollection against a real database', () => {
  let bThingId: ObjectId;

  beforeEach(async () => {
    await getDb().collection(COLLECTION).deleteMany({});
    await thingsA().insertMany([
      { name: 'a1', count: 1 },
      { name: 'a2', count: 2 },
    ]);
    bThingId = (await thingsB().insertOne({ name: 'b1', count: 10 })).insertedId as ObjectId;
  });

  it('stamps weddingId on insert, even if the caller passes another', async () => {
    const sneaky = { name: 'x', count: 0, weddingId: weddingB } as unknown as Omit<
      Thing,
      'weddingId'
    >;
    const { insertedId } = await thingsA().insertOne(sneaky);
    const raw = await getDb().collection<Thing>(COLLECTION).findOne({ _id: insertedId });
    expect(raw?.weddingId).toEqual(weddingA);
  });

  it('reads only its own wedding', async () => {
    expect((await thingsA().find().toArray()).map((t) => t.name).sort()).toEqual(['a1', 'a2']);
    expect(await thingsA().countDocuments()).toBe(2);
    expect(await thingsA().findOne({ _id: bThingId })).toBeNull();
    expect(await thingsA().findOne({ weddingId: weddingB } as never)).toBeNull();
  });

  it("can't update or delete another wedding's document by id", async () => {
    expect(
      (await thingsA().updateOne({ _id: bThingId }, { $set: { name: 'hacked' } })).matchedCount,
    ).toBe(0);
    expect(
      await thingsA().findOneAndUpdate({ _id: bThingId }, { $set: { name: 'hacked' } }),
    ).toBeNull();
    expect((await thingsA().deleteOne({ _id: bThingId })).deletedCount).toBe(0);
    expect((await thingsA().deleteMany({})).deletedCount).toBe(2);
    expect(await thingsB().findOne({ _id: bThingId })).toMatchObject({ name: 'b1' });
  });

  it('refuses to move a document to another wedding', async () => {
    expect(() => thingsA().updateMany({}, { $set: { weddingId: weddingB } })).toThrow(
      /Tenant update/,
    );
    expect(await thingsB().countDocuments()).toBe(1);
  });

  it('scopes aggregations', async () => {
    const [total] = await thingsA()
      .aggregate<{ sum: number }>([{ $group: { _id: null, sum: { $sum: '$count' } } }])
      .toArray();
    expect(total?.sum).toBe(3);
  });

  it('runs transactions on Atlas and rolls back on error', async () => {
    await expect(
      withTransaction(async (session) => {
        await thingsA().insertOne({ name: 'in-txn', count: 0 }, { session });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await thingsA().findOne({ name: 'in-txn' })).toBeNull();

    await withTransaction(async (session) => {
      await thingsA().insertOne({ name: 'committed', count: 0 }, { session });
    });
    expect(await thingsA().findOne({ name: 'committed' })).not.toBeNull();
  });
});
