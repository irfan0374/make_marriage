import 'server-only';
import type {
  AggregateOptions,
  BulkWriteOptions,
  CountDocumentsOptions,
  DeleteOptions,
  Document,
  Filter,
  FindOneAndUpdateOptions,
  FindOptions,
  InsertOneOptions,
  ObjectId,
  OptionalUnlessRequiredId,
  UpdateFilter,
  UpdateOptions,
} from 'mongodb';
import type { WeddingId } from '@/lib/ids';
import { getDb } from './client';

/** Every tenant collection document carries its wedding. */
export interface TenantDocument {
  weddingId: ObjectId;
}

export type TenantInsert<T extends TenantDocument> = Omit<OptionalUnlessRequiredId<T>, 'weddingId'>;

const TENANT_FIELD = 'weddingId';

/**
 * Merge the tenant into a filter. `weddingId` is applied last, so a caller-supplied
 * `weddingId` (or one hidden in `$or`/`$and`, which is ANDed with it) can never widen the scope.
 */
export function tenantFilter<T extends TenantDocument>(
  weddingId: WeddingId,
  filter: Filter<T> = {},
): Filter<T> {
  return { ...filter, [TENANT_FIELD]: weddingId } as Filter<T>;
}

function touchesTenantField(path: string): boolean {
  return path === TENANT_FIELD || path.startsWith(`${TENANT_FIELD}.`);
}

/** Reject updates that would move a document to another wedding or strip its tenant. */
export function assertUpdateKeepsTenant(update: object): void {
  const stages: object[] = Array.isArray(update) ? update : [update];
  for (const stage of stages) {
    for (const [operator, spec] of Object.entries(stage)) {
      if (operator === '$replaceRoot' || operator === '$replaceWith') {
        throw new Error(`Tenant update must not use ${operator}`);
      }
      const paths: string[] =
        typeof spec === 'string'
          ? [spec]
          : Array.isArray(spec)
            ? spec.filter((item): item is string => typeof item === 'string')
            : spec && typeof spec === 'object'
              ? [
                  ...Object.keys(spec),
                  // $rename targets are values, not keys.
                  ...(operator === '$rename'
                    ? Object.values(spec).filter((v): v is string => typeof v === 'string')
                    : []),
                ]
              : [];
      if (paths.some(touchesTenantField)) {
        throw new Error(`Tenant update must not change ${TENANT_FIELD}`);
      }
    }
  }
}

/**
 * The only way tenant repositories reach a collection. Every read, write and aggregation is
 * filtered by `weddingId`, and inserts always get the tenant stamped on them.
 * `$lookup` stages inside `aggregate` must still match on `weddingId` themselves.
 */
export function scopedCollection<T extends TenantDocument>(name: string, weddingId: WeddingId) {
  const collection = getDb().collection<T>(name);
  const scope = (filter?: Filter<T>) => tenantFilter<T>(weddingId, filter);

  return {
    weddingId,
    find: (filter?: Filter<T>, options?: FindOptions) => collection.find(scope(filter), options),
    findOne: (filter?: Filter<T>, options?: FindOptions) =>
      collection.findOne(scope(filter), options),
    countDocuments: (filter?: Filter<T>, options?: CountDocumentsOptions) =>
      collection.countDocuments(scope(filter), options),
    insertOne: (doc: TenantInsert<T>, options?: InsertOneOptions) =>
      collection.insertOne(
        { ...doc, [TENANT_FIELD]: weddingId } as unknown as OptionalUnlessRequiredId<T>,
        options,
      ),
    insertMany: (docs: TenantInsert<T>[], options?: BulkWriteOptions) =>
      collection.insertMany(
        docs.map(
          (doc) =>
            ({ ...doc, [TENANT_FIELD]: weddingId }) as unknown as OptionalUnlessRequiredId<T>,
        ),
        options,
      ),
    updateOne: (
      filter: Filter<T>,
      update: UpdateFilter<T> | Document[],
      options?: UpdateOptions,
    ) => {
      assertUpdateKeepsTenant(update);
      return collection.updateOne(scope(filter), update, options);
    },
    updateMany: (
      filter: Filter<T>,
      update: UpdateFilter<T> | Document[],
      options?: UpdateOptions,
    ) => {
      assertUpdateKeepsTenant(update);
      return collection.updateMany(scope(filter), update, options);
    },
    findOneAndUpdate: (
      filter: Filter<T>,
      update: UpdateFilter<T> | Document[],
      options: FindOneAndUpdateOptions = {},
    ) => {
      assertUpdateKeepsTenant(update);
      return collection.findOneAndUpdate(scope(filter), update, {
        ...options,
        includeResultMetadata: false,
      });
    },
    deleteOne: (filter: Filter<T>, options?: DeleteOptions) =>
      collection.deleteOne(scope(filter), options),
    deleteMany: (filter: Filter<T>, options?: DeleteOptions) =>
      collection.deleteMany(scope(filter), options),
    aggregate: <R extends Document = Document>(pipeline: Document[], options?: AggregateOptions) =>
      collection.aggregate<R>([{ $match: { [TENANT_FIELD]: weddingId } }, ...pipeline], options),
  };
}

export type ScopedCollection<T extends TenantDocument> = ReturnType<typeof scopedCollection<T>>;
