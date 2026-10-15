'use client';

import { useCallback, useRef, useState } from 'react';
import type { DownloadUrlsInput } from '@/modules/gallery/gallery.types';
import { ApiError } from '@/shared/api-client';
import { getDownloadPart } from './api';
import { makeZip, type ZipEntry } from './zip';

// "Download all", an album or a selection (PRD GAL-8): the browser fetches each part's photos
// (about 500), builds a ZIP and saves it, then moves on to the next part. A 3 GB gallery can't
// be zipped inside a server request, so it happens here.

const PARALLEL = 4;

export type ZipStatus = 'idle' | 'working' | 'done' | 'error';

export interface ZipProgress {
  status: ZipStatus;
  part: number;
  totalParts: number;
  /** Photos fetched in this part, and how many it has. */
  fetched: number;
  inPart: number;
  saved: number;
  failed: number;
  message: string | null;
}

const IDLE: ZipProgress = {
  status: 'idle',
  part: 0,
  totalParts: 0,
  fetched: 0,
  inPart: 0,
  saved: 0,
  failed: 0,
  message: null,
};

async function fetchPhoto(url: string, signal: AbortSignal): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`GET ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (signal.aborted || attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "nafiya-irfan-mehendi" from a label. */
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'photos';

export function useZipDownload(weddingId: string) {
  const [progress, setProgress] = useState<ZipProgress>(IDLE);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(
    async (selection: DownloadUrlsInput, label: string) => {
      const controller = new AbortController();
      abort.current = controller;
      const name = slug(label);
      let cursor: string | null = null;
      let saved = 0;
      let failed = 0;
      setProgress({ ...IDLE, status: 'working' });
      try {
        do {
          const part = await getDownloadPart(
            weddingId,
            'photoIds' in selection ? selection : { ...selection, cursor },
          );
          cursor = 'photoIds' in selection ? null : part.nextCursor;
          setProgress((p) => ({
            ...p,
            part: part.part,
            totalParts: part.totalParts,
            fetched: 0,
            inPart: part.files.length,
          }));
          const entries: (ZipEntry | null)[] = new Array(part.files.length).fill(null);
          let next = 0;
          await Promise.all(
            Array.from({ length: PARALLEL }, async () => {
              for (let i = next++; i < part.files.length; i = next++) {
                const file = part.files[i]!;
                try {
                  entries[i] = {
                    name: file.fileName,
                    data: await fetchPhoto(file.url, controller.signal),
                  };
                } catch (error) {
                  if (controller.signal.aborted) throw error;
                  failed++;
                }
                setProgress((p) => ({ ...p, fetched: p.fetched + 1, failed }));
              }
            }),
          );
          const ready = entries.filter((e): e is ZipEntry => e !== null);
          if (ready.length > 0) {
            const suffix = part.totalParts > 1 ? `-part-${part.part}-of-${part.totalParts}` : '';
            save(makeZip(ready), `${name}${suffix}.zip`);
            saved += ready.length;
          }
          setProgress((p) => ({ ...p, saved }));
        } while (cursor && !controller.signal.aborted);
        setProgress((p) => ({ ...p, status: 'done', saved, failed }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setProgress((p) => ({
          ...p,
          status: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'The download stopped. Check your connection and try again.',
        }));
      }
    },
    [weddingId],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    setProgress(IDLE);
  }, []);

  const close = useCallback(() => setProgress(IDLE), []);

  return { progress, start, cancel, close };
}
