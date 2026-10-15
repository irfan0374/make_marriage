import 'server-only';
import { ObjectId, type ClientSession, type Filter } from 'mongodb';
import { MAX_VENDORS_PER_WEDDING } from '@/config/constants';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { toObjectId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getUsersByIds } from '@/modules/auth';
import { getEvent } from '@/modules/events';
import { fileViewUrl, removeFile, verifyUploadedFile } from '@/modules/files';
import { isMember, resolveWeddingContext, type WeddingContext } from '@/modules/members';
import { lockWeddingTasks, requireWritableWedding } from '@/modules/weddings';
import {
  countVendors,
  deleteVendor as deleteVendorDoc,
  findVendor,
  findVendorNames,
  insertVendor,
  listVendors as listVendorDocs,
  pullEvent,
  updateVendor,
} from './vendors.repository';
import { MAX_ATTACHMENTS } from './vendors.schemas';
import type {
  AddAttachmentInput,
  CreateVendorInput,
  ListVendorsQuery,
  UpdateVendorInput,
  Vendor,
  VendorDocument,
} from './vendors.types';

// The vendor tracker (api-spec §14, PRD VEND-1 to VEND-7): the couple's caterers, photographers
// and others, their status, the events they serve, and their quotes and contracts. Every member
// can manage vendors; an archived wedding is read-only. Writes run under the wedding lock, so an
// event can't be deleted while a vendor is being linked to it.

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function toVendors(docs: VendorDocument[]): Promise<Vendor[]> {
  const users = await getUsersByIds(
    [...new Set(docs.map((d) => d.editedByUserId.toHexString()))].map(toObjectId),
  );
  return docs.map((doc) => {
    const editor = users.get(doc.editedByUserId.toHexString());
    return {
      id: doc._id.toHexString(),
      name: doc.name,
      category: doc.category,
      contactName: doc.contactName,
      contactRole: doc.contactRole,
      phone: doc.phone,
      whatsapp: doc.whatsapp,
      email: doc.email,
      notes: doc.notes,
      status: doc.status,
      eventIds: doc.eventIds.map((id) => id.toHexString()),
      contractAmountPaise: doc.contractAmountPaise,
      attachments: doc.attachments.map((a) => ({
        id: a._id.toHexString(),
        fileName: a.fileName,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        uploadedAt: a.uploadedAt.toISOString(),
      })),
      editedBy: editor ? { userId: editor.id, name: editor.name } : null,
      editedAt: doc.editedAt.toISOString(),
      createdAt: doc.createdAt.toISOString(),
    };
  });
}

function fieldError(path: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', undefined, { details: [{ path, message }] });
}

/** A vendor change: a member, a wedding that isn't archived, under the wedding lock. */
async function writeVendors<T>(
  token: string | undefined,
  weddingId: ObjectId,
  fn: (args: { context: WeddingContext; session: ClientSession }) => Promise<T>,
): Promise<T> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  return withTransaction(async (session) => {
    await lockWeddingTasks(context.weddingId, session);
    // Removed from the team a moment ago? Then not any more.
    if (!(await isMember(context.weddingId, context.userId, session))) {
      throw new AppError('NOT_FOUND');
    }
    return fn({ context, session });
  });
}

/** Every linked event must be this wedding's. */
async function resolveEvents(weddingId: WeddingId, ids: string[], session: ClientSession) {
  const resolved: ObjectId[] = [];
  for (const id of ids) {
    const eventId = toObjectId(id);
    if (!(await getEvent(weddingId, eventId, session))) {
      throw fieldError('eventIds', 'Choose events from this wedding');
    }
    resolved.push(eventId);
  }
  return resolved;
}

/** GET /api/weddings/{weddingId}/vendors (api-spec §14.1). */
export async function listVendors(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListVendorsQuery,
): Promise<Vendor[]> {
  const context = await resolveWeddingContext(token, weddingId);
  const filter: Filter<VendorDocument> = {};
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { notes: pattern }, { contactName: pattern }];
  }
  if (query.category) filter.category = { $in: query.category };
  if (query.status) filter.status = { $in: query.status };
  if (query.eventId) filter.eventIds = toObjectId(query.eventId);
  return toVendors(await listVendorDocs(context.weddingId, filter, query.sort));
}

/** GET /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.3). */
export async function getVendor(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
): Promise<Vendor> {
  const context = await resolveWeddingContext(token, weddingId);
  const doc = await findVendor(context.weddingId, vendorId);
  if (!doc) throw new AppError('NOT_FOUND');
  return (await toVendors([doc]))[0]!;
}

/** POST /api/weddings/{weddingId}/vendors (api-spec §14.2). */
export async function createVendor(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateVendorInput,
  now = new Date(),
): Promise<Vendor> {
  const doc = await writeVendors(token, weddingId, async ({ context, session }) => {
    if ((await countVendors(context.weddingId, session)) >= MAX_VENDORS_PER_WEDDING) {
      throw new AppError('VENDOR_LIMIT_REACHED');
    }
    const eventIds = await resolveEvents(context.weddingId, input.eventIds, session);
    return insertVendor(
      context.weddingId,
      {
        _id: new ObjectId(),
        ...input,
        eventIds,
        source: 'manual',
        placeId: null,
        attachments: [],
        createdByUserId: context.userId,
        editedByUserId: context.userId,
        editedAt: now,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      session,
    );
  });
  logger.info('vendor.created', { weddingId: doc.weddingId.toHexString() });
  return (await toVendors([doc]))[0]!;
}

/** PATCH /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.4). */
export async function updateVendorDetails(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
  input: UpdateVendorInput,
  now = new Date(),
): Promise<Vendor> {
  const doc = await writeVendors(token, weddingId, async ({ context, session }) => {
    const { eventIds, ...rest } = input;
    const updated = await updateVendor(
      context.weddingId,
      vendorId,
      {
        $set: {
          ...rest,
          ...(eventIds
            ? { eventIds: await resolveEvents(context.weddingId, eventIds, session) }
            : {}),
          editedByUserId: context.userId,
          editedAt: now,
          updatedAt: now,
        },
      },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    return updated;
  });
  return (await toVendors([doc]))[0]!;
}

/** DELETE /api/weddings/{weddingId}/vendors/{vendorId} (api-spec §14.5): its files go too. */
export async function deleteVendor(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
): Promise<void> {
  const deleted = await writeVendors(token, weddingId, async ({ context, session }) => {
    const doc = await deleteVendorDoc(context.weddingId, vendorId, session);
    if (!doc) throw new AppError('NOT_FOUND');
    return doc;
  });
  // After the vendor is gone: a file left behind by a failure is only storage, never a link.
  await Promise.all(deleted.attachments.map((a) => removeFile(a.key)));
}

/**
 * POST /api/weddings/{weddingId}/vendors/{vendorId}/attachments (api-spec §14.6): a quote or
 * contract uploaded to this vendor's folder (image or PDF, checked by its content).
 */
export async function addVendorAttachment(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
  input: AddAttachmentInput,
  now = new Date(),
): Promise<Vendor> {
  const context = await resolveWeddingContext(token, weddingId);
  if (!(await findVendor(context.weddingId, vendorId))) throw new AppError('NOT_FOUND');
  const file = await verifyUploadedFile(
    context.weddingId,
    'vendor_attachment',
    input.key,
    vendorId,
  );
  const doc = await writeVendors(token, weddingId, async ({ session }) => {
    const current = await findVendor(context.weddingId, vendorId, session);
    if (!current) throw new AppError('NOT_FOUND');
    if (current.attachments.some((a) => a.key === file.key)) return current;
    if (current.attachments.length >= MAX_ATTACHMENTS) {
      throw new AppError('ATTACHMENT_LIMIT_REACHED');
    }
    const updated = await updateVendor(
      context.weddingId,
      vendorId,
      {
        $push: {
          attachments: {
            _id: new ObjectId(),
            key: file.key,
            fileName: input.fileName,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
            uploadedAt: now,
          },
        },
        $set: { editedByUserId: context.userId, editedAt: now, updatedAt: now },
      },
      session,
    );
    if (!updated) throw new AppError('NOT_FOUND');
    return updated;
  });
  return (await toVendors([doc]))[0]!;
}

/** DELETE .../vendors/{vendorId}/attachments/{attachmentId} (api-spec §14.7). */
export async function removeVendorAttachment(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
  attachmentId: ObjectId,
  now = new Date(),
): Promise<void> {
  const removed = await writeVendors(token, weddingId, async ({ context, session }) => {
    const current = await findVendor(context.weddingId, vendorId, session);
    const attachment = current?.attachments.find((a) => a._id.equals(attachmentId));
    if (!current || !attachment) throw new AppError('NOT_FOUND');
    await updateVendor(
      context.weddingId,
      vendorId,
      {
        $pull: { attachments: { _id: attachmentId } },
        $set: { editedByUserId: context.userId, editedAt: now, updatedAt: now },
      },
      session,
    );
    return attachment;
  });
  await removeFile(removed.key);
}

/**
 * GET .../vendors/{vendorId}/attachments/{attachmentId}: a short-lived link to open the file
 * (api-spec §14.8). Any member may read; the link lasts an hour.
 */
export async function vendorAttachmentUrl(
  token: string | undefined,
  weddingId: ObjectId,
  vendorId: ObjectId,
  attachmentId: ObjectId,
): Promise<string> {
  const context = await resolveWeddingContext(token, weddingId);
  const doc = await findVendor(context.weddingId, vendorId);
  const attachment = doc?.attachments.find((a) => a._id.equals(attachmentId));
  if (!attachment) throw new AppError('NOT_FOUND');
  return fileViewUrl(attachment.key);
}

/** Cleanup when an event is deleted (database-design §8): it comes off every vendor. */
export function removeEventFromVendors(
  weddingId: WeddingId,
  eventId: ObjectId,
  session: ClientSession,
): Promise<void> {
  return pullEvent(weddingId, eventId, session);
}

/**
 * Current names of these vendors, by id hex; deleted ones are missing. For expenses, which link
 * to vendors and show their name.
 */
export async function vendorNames(
  weddingId: WeddingId,
  vendorIds: ObjectId[],
  session?: ClientSession,
): Promise<Map<string, string>> {
  if (vendorIds.length === 0) return new Map();
  const docs = await findVendorNames(weddingId, vendorIds, session);
  return new Map(docs.map((d) => [d._id.toHexString(), d.name]));
}
