import 'server-only';

// Public API of the gallery module: the couple's gallery (api-spec §19.1) and the guest gallery
// (api-spec §19.2).
export {
  bulkPhotosHandler,
  completeTeamUploadsHandler,
  completeUploadsHandler,
  createTeamUploadsHandler,
  createUploadsHandler,
  downloadUrlsHandler,
  deletePhotoHandler,
  galleryQrHandler,
  getGalleryHandler,
  getPublicGalleryHandler,
  listPhotosHandler,
  listPublicPhotosHandler,
  regenerateLinkHandler,
  updateGalleryHandler,
  updatePhotoHandler,
} from './gallery.handlers';
export { galleryCollectionSpecs } from './gallery.indexes';
export {
  cleanupPendingPhotos,
  fingerprintOf,
  getGalleryPage,
  movePhotosToGeneral,
} from './gallery.service';
export type { PublicGallery } from './gallery.types';
