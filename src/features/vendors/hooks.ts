'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadFile } from '@/features/files/upload';
import {
  addAttachment,
  createVendor,
  deleteVendor,
  getVendors,
  removeAttachment,
  updateVendor,
} from '@/features/vendors/api';
import type { CreateVendorInput, UpdateVendorInput } from '@/modules/vendors/vendors.types';

export const vendorsKey = (weddingId: string) => ['weddings', weddingId, 'vendors'] as const;

/** All the wedding's vendors (a few dozen at most); the page filters them. */
export function useVendors(weddingId: string) {
  return useQuery({ queryKey: vendorsKey(weddingId), queryFn: () => getVendors(weddingId) });
}

function useRefresh(weddingId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: vendorsKey(weddingId) });
    // Expenses show vendors' names (and keep the name of one that's deleted).
    void queryClient.invalidateQueries({ queryKey: ['weddings', weddingId, 'expenses'] });
  };
}

export function useCreateVendor(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: (input: CreateVendorInput) => createVendor(weddingId, input),
    onSettled,
  });
}

export function useUpdateVendor(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVendorInput }) =>
      updateVendor(weddingId, id, input),
    onSettled,
  });
}

export function useDeleteVendor(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({ mutationFn: (id: string) => deleteVendor(weddingId, id), onSettled });
}

/** Upload a quote or contract straight to storage, then attach it to the vendor. */
export function useAddAttachment(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: async ({ vendorId, file }: { vendorId: string; file: File }) => {
      const key = await uploadFile(weddingId, 'vendor_attachment', file, { vendorId });
      return addAttachment(weddingId, vendorId, { key, fileName: file.name });
    },
    onSettled,
  });
}

export function useRemoveAttachment(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: ({ vendorId, attachmentId }: { vendorId: string; attachmentId: string }) =>
      removeAttachment(weddingId, vendorId, attachmentId),
    onSettled,
  });
}
