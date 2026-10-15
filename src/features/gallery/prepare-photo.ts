import {
  DISPLAY_EDGE,
  MAX_DISPLAY_BYTES,
  MAX_THUMB_BYTES,
  THUMB_EDGE,
  type PhotoType,
} from '@/modules/gallery/gallery.schemas';

// Photos are prepared in the guest's browser before upload (PRD GAL-3): a display copy of about
// 2000px and a thumbnail, as WebP (JPEG where the browser can't make WebP, e.g. Safari). Drawing
// the image again drops its location and other details. Originals are never uploaded.

export interface PreparedPhoto {
  display: Blob;
  thumb: Blob;
  width: number;
  height: number;
  contentType: PhotoType;
  /** A small preview for the upload sheet. */
  previewUrl: string;
}

export class PhotoProblem extends Error {}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Draw `bitmap` with its longest side at most `edge`. */
function drawn(bitmap: ImageBitmap, edge: number): HTMLCanvasElement {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

let webpSupported: boolean | undefined;
async function canEncodeWebp(): Promise<boolean> {
  if (webpSupported === undefined) {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    webpSupported = (await encode(probe, 'image/webp', 0.8))?.type === 'image/webp';
  }
  return webpSupported;
}

/** Encode under `maxBytes`, lowering the quality step by step. */
async function encodeUnder(
  canvas: HTMLCanvasElement,
  type: PhotoType,
  maxBytes: number,
  qualities: number[],
): Promise<Blob> {
  for (const quality of qualities) {
    const blob = await encode(canvas, type, quality);
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new PhotoProblem('This photo is too large even after resizing.');
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  let bitmap: ImageBitmap;
  try {
    // Turned upright from the camera's orientation.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoProblem("This photo can't be read on this device. Try a JPG or PNG copy.");
  }
  try {
    const type: PhotoType = (await canEncodeWebp()) ? 'image/webp' : 'image/jpeg';
    const big = drawn(bitmap, DISPLAY_EDGE);
    const small = drawn(bitmap, THUMB_EDGE);
    const display = await encodeUnder(big, type, MAX_DISPLAY_BYTES, [0.82, 0.72, 0.6, 0.5]);
    const thumb = await encodeUnder(small, type, MAX_THUMB_BYTES, [0.72, 0.6, 0.45]);
    return {
      display,
      thumb,
      width: big.width,
      height: big.height,
      contentType: type,
      previewUrl: URL.createObjectURL(thumb),
    };
  } finally {
    bitmap.close();
  }
}
