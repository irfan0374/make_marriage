import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  addAttachmentSchema,
  createVendorSchema,
  listVendorsQuerySchema,
  updateVendorSchema,
  vendorCategorySchema,
  vendorStatusSchema,
} from './vendors.schemas';

export type VendorCategory = z.output<typeof vendorCategorySchema>;
export type VendorStatus = z.output<typeof vendorStatusSchema>;
export type CreateVendorInput = z.output<typeof createVendorSchema>;
export type UpdateVendorInput = z.output<typeof updateVendorSchema>;
export type ListVendorsQuery = z.output<typeof listVendorsQuerySchema>;
export type AddAttachmentInput = z.output<typeof addAttachmentSchema>;

export interface AttachmentDocument {
  _id: ObjectId;
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

/** `vendors` collection (database-design §7.8). */
export interface VendorDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  name: string;
  category: VendorCategory;
  contactName: string;
  contactRole: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string;
  status: VendorStatus;
  eventIds: ObjectId[];
  /** The agreed price in paise, or `null` when not known. */
  contractAmountPaise: number | null;
  source: 'manual' | 'google';
  placeId: string | null;
  attachments: AttachmentDocument[];
  createdByUserId: ObjectId;
  editedByUserId: ObjectId;
  editedAt: Date;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

export interface VendorAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

/** A vendor as the API returns it (api-spec §4.8). */
export interface Vendor {
  id: string;
  name: string;
  category: VendorCategory;
  contactName: string;
  contactRole: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  notes: string;
  status: VendorStatus;
  eventIds: string[];
  contractAmountPaise: number | null;
  attachments: VendorAttachment[];
  editedBy: { userId: string; name: string } | null;
  editedAt: string;
  createdAt: string;
}
