import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type { PublicUser } from '@/modules/auth/auth.types';
import type { Role, SideScope } from '@/modules/members/members.types';
import type { createWeddingSchema } from './weddings.schemas';

export type CreateWeddingInput = z.output<typeof createWeddingSchema>;
export type WeddingStatus = 'active' | 'archived';

export interface WeddingLocation {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  searchRadiusKm: number;
}

/** `weddings` collection, the tenant root (database-design §7.1). */
export interface WeddingDocument {
  _id: ObjectId;
  brideName: string;
  groomName: string;
  weddingDate: string;
  city: string;
  /**
   * Free-text venue, e.g. "Grand Hyatt, Bolgatty Island". `""` when not given; missing on
   * weddings created before the field existed.
   */
  venue?: string;
  timezone: string;
  sidesEnabled: boolean;
  status: WeddingStatus;
  archivedAt: Date | null;
  createdByUserId: ObjectId;
  customExpenseCategories: string[];
  guestTags: string[];
  location: WeddingLocation | null;
  invitation: {
    mediaKey: string | null;
    mediaType: 'image' | 'video' | null;
    mediaSizeBytes: number | null;
    message: string;
    rsvpDeadline: string | null;
    autoRemindersEnabled: boolean;
  };
  website: {
    slug: string | null;
    published: boolean;
    publishedAt: Date | null;
    theme: 'classic' | 'floral' | 'modern';
    accentColor: string;
    sections: Record<'hero' | 'story' | 'events' | 'photos' | 'liveStream' | 'gallery', boolean>;
    story: string;
    coverKey: string | null;
    photoKeys: string[];
    liveStream: { url: string; videoId: string; startsAt: Date; enabled: boolean } | null;
    indexable: boolean;
  };
  gallery: {
    token: string;
    uploadsOpen: boolean;
    guestViewing: boolean;
    storageUsedBytes: number;
    storageReservedBytes: number;
    storageCapBytes: number;
  };
  retention: { warningSentAt: Date | null; filesDeletedAt: Date | null };
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

/** Wedding as the API returns it (api-spec §4.3). */
export interface Wedding {
  id: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  city: string;
  venue: string;
  timezone: string;
  sidesEnabled: boolean;
  status: WeddingStatus;
  archivedAt: string | null;
  location: WeddingLocation | null;
  customExpenseCategories: string[];
  guestTags: string[];
  me: { role: Role; sideScope: SideScope };
  createdAt: string;
  updatedAt: string;
}

/** A wedding in the user's list (api-spec §4.2). */
export interface WeddingSummary {
  id: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  city: string;
  status: WeddingStatus;
  myRole: Role;
}

/** `GET /api/me` (api-spec §5.7). */
export interface Me {
  user: PublicUser;
  weddings: WeddingSummary[];
}
