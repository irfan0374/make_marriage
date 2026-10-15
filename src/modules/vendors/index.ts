import 'server-only';

// Public API of the vendors module (api-spec §14).
export {
  addAttachmentHandler,
  createVendorHandler,
  deleteVendorHandler,
  getVendorHandler,
  listVendorsHandler,
  openAttachmentHandler,
  removeAttachmentHandler,
  updateVendorHandler,
} from './vendors.handlers';
export { vendorsCollectionSpecs } from './vendors.indexes';
export { removeEventFromVendors, vendorNames } from './vendors.service';
export type { Vendor } from './vendors.types';
