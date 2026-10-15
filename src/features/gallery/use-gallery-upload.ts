'use client';

import { useCallback, useRef, useState } from 'react';
import { ApiError } from '@/shared/api-client';
import type { UploadRequestInput } from '@/modules/gallery/gallery.types';
import { completeTeamUploads, completeUploads, requestTeamUploads, requestUploads } from './api';
import { PhotoProblem, preparePhoto, type PreparedPhoto } from './prepare-photo';

// Guests' uploads (PRD GAL-2, GAL-3, GAL-11): photos are prepared a few at a time, upload links
// are asked for (which reserves storage), each photo's two files go straight to storage three at
// a time with progress, and the batch is confirmed. Failed uploads retry by themselves (waiting
// for the connection to come back), and the guest can retry the rest.

const BATCH = 10;
const PARALLEL = 3;
const ATTEMPTS = 4;
const BACKOFF_MS = [1000, 3000, 8000];

export type ItemStatus = 'queued' | 'preparing' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  name: string;
  status: ItemStatus;
  /** 0 to 1 while uploading. */
  progress: number;
  previewUrl: string | null;
  error: string | null;
}

/** `full`: the gallery ran out of storage; `closed`: uploads were turned off meanwhile. */
export type UploadPhase = 'idle' | 'uploading' | 'finished' | 'full' | 'closed' | 'failed';

interface Links {
  photoId: string;
  display: { url: string; headers: Record<string, string> };
  thumb: { url: string; headers: Record<string, string> };
  expiresAt: number;
}

interface Work {
  file: File;
  prepared: PreparedPhoto | null;
  links: Links | null;
  sent: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForOnline(): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine) return Promise.resolve();
  return new Promise((resolve) =>
    window.addEventListener('online', () => resolve(), { once: true }),
  );
}

/** PUT one file with progress; rejects on failure or abort. */
function put(
  link: { url: string; headers: Record<string, string> },
  body: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', link.url);
    // Content-Length is set by the browser from the body; it matches the signed size.
    xhr.setRequestHeader('Content-Type', link.headers['Content-Type']!);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`));
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** Where the photos go: a guest through the gallery link, or the team through its own API. */
export type UploadTarget = { kind: 'guest'; token: string } | { kind: 'team'; weddingId: string };

export function useGalleryUpload(target: UploadTarget) {
  const request = useCallback(
    (input: UploadRequestInput) =>
      target.kind === 'guest'
        ? requestUploads(target.token, input)
        : requestTeamUploads(target.weddingId, input),
    [target],
  );
  const confirmIds = useCallback(
    (photoIds: string[]) =>
      target.kind === 'guest'
        ? completeUploads(target.token, photoIds)
        : completeTeamUploads(target.weddingId, photoIds),
    [target],
  );
  const [items, setItems] = useState<UploadItem[]>([]);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const work = useRef(new Map<string, Work>());
  const abort = useRef<AbortController | null>(null);
  const options = useRef<{ albumEventId: string | null; uploaderName: string | null }>({
    albumEventId: null,
    uploaderName: null,
  });

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  /** Upload one photo's two files, retrying; `true` when both are in storage. */
  const send = useCallback(
    async (id: string, signal: AbortSignal): Promise<boolean> => {
      const w = work.current.get(id)!;
      if (!w.prepared || !w.links) return false;
      const total = w.prepared.display.size + w.prepared.thumb.size;
      patch(id, { status: 'uploading', progress: 0, error: null });
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        try {
          await waitForOnline();
          let displaySent = 0;
          await put(
            w.links.display,
            w.prepared.display,
            (s) => {
              displaySent = s;
              patch(id, { progress: s / total });
            },
            signal,
          );
          await put(
            w.links.thumb,
            w.prepared.thumb,
            (s) => {
              patch(id, { progress: (displaySent + s) / total });
            },
            signal,
          );
          w.sent = total;
          patch(id, { progress: 1 });
          return true;
        } catch (error) {
          if (signal.aborted) throw error;
          if (attempt < ATTEMPTS - 1) await sleep(BACKOFF_MS[attempt] ?? 8000);
        }
      }
      patch(id, { status: 'error', error: "Couldn't upload. Check your connection and retry." });
      return false;
    },
    [patch],
  );

  /** Ask for upload links for these prepared photos. Throws ApiError to stop the run. */
  const linksFor = useCallback(
    async (ids: string[]) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const ticket = await request({
            albumEventId: options.current.albumEventId,
            uploaderName: options.current.uploaderName,
            files: ids.map((id) => {
              const p = work.current.get(id)!.prepared!;
              return {
                clientId: id,
                contentType: p.contentType,
                width: p.width,
                height: p.height,
                displayBytes: p.display.size,
                thumbBytes: p.thumb.size,
              };
            }),
          });
          const expiresAt = new Date(ticket.expiresAt).getTime();
          for (const u of ticket.uploads) {
            work.current.get(u.clientId)!.links = { ...u, expiresAt };
          }
          return;
        } catch (error) {
          // Too many requests from this phone: wait a little and try again.
          if (error instanceof ApiError && error.code === 'RATE_LIMITED' && attempt < 3) {
            await sleep(15_000);
            continue;
          }
          if (error instanceof ApiError || attempt >= 2) throw error;
          await waitForOnline();
          await sleep(BACKOFF_MS[attempt] ?? 3000);
        }
      }
    },
    [request],
  );

  /** Confirm uploaded photos; ones not found are sent once more. */
  const confirm = useCallback(
    async (ids: string[], signal: AbortSignal) => {
      const byPhoto = new Map(ids.map((id) => [work.current.get(id)!.links!.photoId, id]));
      let pending = [...byPhoto.keys()];
      for (let round = 0; round < 2 && pending.length > 0; round++) {
        let result;
        try {
          result = await confirmIds(pending);
        } catch {
          await sleep(3000);
          continue;
        }
        for (const photoId of result.ready) patch(byPhoto.get(photoId)!, { status: 'done' });
        for (const photoId of result.rejected) {
          patch(byPhoto.get(photoId)!, { status: 'error', error: "This file isn't a photo." });
        }
        pending = result.missing.filter((p) => byPhoto.has(p));
        if (round === 0) {
          for (const photoId of pending) await send(byPhoto.get(photoId)!, signal);
        }
      }
      for (const photoId of pending) {
        patch(byPhoto.get(photoId)!, { status: 'error', error: "Couldn't upload. Retry." });
      }
    },
    [patch, send, confirmIds],
  );

  /** Prepare, get links, upload and confirm `ids`, a batch at a time. */
  const run = useCallback(
    async (ids: string[]) => {
      const controller = new AbortController();
      abort.current = controller;
      setPhase('uploading');
      setMessage(null);
      try {
        for (let i = 0; i < ids.length; i += BATCH) {
          const batch = ids.slice(i, i + BATCH);
          const ready: string[] = [];
          for (const id of batch) {
            const w = work.current.get(id)!;
            if (w.prepared) {
              ready.push(id);
              continue;
            }
            patch(id, { status: 'preparing' });
            try {
              w.prepared = await preparePhoto(w.file);
              patch(id, { previewUrl: w.prepared.previewUrl, status: 'queued' });
              ready.push(id);
            } catch (error) {
              patch(id, {
                status: 'error',
                error: error instanceof PhotoProblem ? error.message : "This photo can't be read.",
              });
            }
          }
          const needLinks = ready.filter((id) => {
            const links = work.current.get(id)!.links;
            return !links || links.expiresAt - 60_000 < Date.now();
          });
          if (needLinks.length > 0) await linksFor(needLinks);
          // Upload, a few at a time.
          const queue = [...ready];
          const sent: string[] = [];
          await Promise.all(
            Array.from({ length: PARALLEL }, async () => {
              for (let id = queue.shift(); id; id = queue.shift()) {
                if (await send(id, controller.signal)) sent.push(id);
              }
            }),
          );
          if (sent.length > 0) await confirm(sent, controller.signal);
        }
        setPhase('finished');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.code === 'STORAGE_LIMIT_REACHED') setPhase('full');
        else if (error instanceof ApiError && error.code === 'UPLOADS_CLOSED') setPhase('closed');
        else {
          setPhase('failed');
          setMessage(error instanceof ApiError ? error.message : "Couldn't upload. Please retry.");
        }
        setItems((all) =>
          all.map((item) =>
            item.status === 'done' || item.status === 'error'
              ? item
              : { ...item, status: 'error', error: 'Not uploaded.' },
          ),
        );
      }
    },
    [confirm, linksFor, patch, send],
  );

  const start = useCallback(
    (files: File[], opts: { albumEventId: string | null; uploaderName: string | null }) => {
      options.current = opts;
      work.current = new Map();
      const fresh = files.map((file, i) => {
        const id = `p${Date.now().toString(36)}${i}`;
        work.current.set(id, { file, prepared: null, links: null, sent: 0 });
        return {
          id,
          name: file.name,
          status: 'queued' as const,
          progress: 0,
          previewUrl: null,
          error: null,
        };
      });
      setItems(fresh);
      void run(fresh.map((f) => f.id));
    },
    [run],
  );

  /** Try the failed photos again. */
  const retry = useCallback(
    (id?: string) => {
      const ids = items
        .filter((i) => i.status === 'error' && (!id || i.id === id))
        .map((i) => i.id);
      if (ids.length > 0) void run(ids);
    },
    [items, run],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    setPhase('idle');
    setItems([]);
  }, []);

  const reset = useCallback(() => {
    for (const w of work.current.values()) {
      if (w.prepared) URL.revokeObjectURL(w.prepared.previewUrl);
    }
    work.current = new Map();
    setItems([]);
    setPhase('idle');
    setMessage(null);
  }, []);

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const progress =
    items.length === 0
      ? 0
      : items.reduce((sum, i) => sum + (i.status === 'done' ? 1 : i.progress * 0.95), 0) /
        items.length;

  return { items, phase, message, done, failed, progress, start, retry, cancel, reset };
}
