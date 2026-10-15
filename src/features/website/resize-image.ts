import { SNIFF_BYTES, sniffImageType } from '@/modules/files/files.schemas';

// Website photos are resized in the browser before upload (architecture §8): a phone photo of
// 5-10 MB becomes a JPEG of a few hundred KB, under the 2 MB limit (api-spec §15.2).

const MAX_BYTES = 2 * 1024 * 1024;

export class ImageProblem extends Error {}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** A JPEG copy of `file` whose longest side is at most `maxEdge` pixels. */
export async function resizeImage(file: File, maxEdge: number): Promise<File> {
  const start = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  if (!sniffImageType(start)) throw new ImageProblem('Choose a JPG, PNG or WebP photo.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageProblem("This photo couldn't be opened. Try another one.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.86, 0.75, 0.6]) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
    }
  }
  throw new ImageProblem('This photo is too large. Try a smaller one.');
}
