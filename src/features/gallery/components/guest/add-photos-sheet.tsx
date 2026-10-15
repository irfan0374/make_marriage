'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import {
  ArrowRight,
  Camera,
  Check,
  CircleAlert,
  CloudOff,
  CloudUpload,
  Folder,
  Hourglass,
  ImagePlus,
  Images,
  Lock,
  RefreshCw,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME } from '@/config/app';
import { MAX_UPLOADER_NAME } from '@/modules/gallery/gallery.schemas';
import type { PublicGallery } from '@/modules/gallery/gallery.types';
import { cn } from '@/shared/cn';
import { useGalleryUpload, type UploadItem, type UploadTarget } from '../../use-gallery-upload';

// Stitch "Add Photos (Sheet)" and "Upload Progress & Complete": choose photos, add a name and an
// album, then watch them upload. A bottom sheet on phones, a centred modal on larger screens.

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: UploadTarget;
  /** The team uploads under their own name, so the name field is left out. */
  uploaderName?: string;
  gallery: Pick<PublicGallery, 'weddingName' | 'albums' | 'limits'>;
  /** The album being viewed, chosen by default. */
  defaultAlbum: string | null;
  /** Photos were added: refresh the gallery. */
  onUploaded: () => void;
  onViewGallery: () => void;
}

export function AddPhotosSheet({
  open,
  onOpenChange,
  target,
  uploaderName,
  gallery,
  defaultAlbum,
  onUploaded,
  onViewGallery,
}: Props) {
  const upload = useGalleryUpload(target);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [album, setAlbum] = useState<string>(defaultAlbum ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const max = gallery.limits.maxFilesPerRequest;
  const busy = upload.phase === 'uploading';

  // Previews of the chosen files (formats this browser can't show just show a tile).
  const previews = useMemo(() => files.slice(0, 4).map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Each finished run refreshes the gallery behind the sheet.
  const finished = upload.phase === 'finished' && upload.done > 0;
  useEffect(() => {
    if (finished) onUploaded();
  }, [finished, onUploaded]);

  function choose(list: FileList | null) {
    const chosen = [...(list ?? [])];
    if (chosen.length === 0) return;
    setNotice(
      chosen.length > max
        ? `You can add ${max} photos at a time; the first ${max} are chosen.`
        : null,
    );
    setFiles(chosen.slice(0, max));
  }

  function startOver() {
    upload.reset();
    setFiles([]);
    setNotice(null);
  }

  function close(next: boolean) {
    if (next) return onOpenChange(true);
    // Closing mid-upload stops it; finished or empty sheets just close.
    if (busy) upload.cancel();
    if (!busy && upload.phase !== 'idle') startOver();
    onOpenChange(false);
  }

  const title =
    upload.phase === 'uploading'
      ? 'Uploading photos'
      : upload.phase === 'idle'
        ? 'Add photos'
        : upload.phase === 'full'
          ? 'Upload to album'
          : 'Photos added';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={close}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="bg-primary/20 fixed inset-0 z-40 backdrop-blur-[2px]" />
        <DialogPrimitive.Popup
          className={cn(
            'bg-surface fixed z-50 flex max-h-[92dvh] flex-col overflow-y-auto shadow-2xl outline-none',
            'inset-x-0 bottom-0 rounded-t-[28px] px-5 pt-3 pb-8',
            'md:inset-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[24px] md:p-7',
          )}
        >
          <div className="flex justify-center pb-2 md:hidden">
            <span className="bg-border h-1 w-10 rounded-full" />
          </div>
          <div className="flex items-center justify-between pt-1 pb-3">
            <div className="flex items-center gap-2">
              {busy && <span className="bg-gold-deep size-2 animate-pulse rounded-full" />}
              <DialogPrimitive.Title className="text-primary text-2xl tracking-tight">
                {title}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              aria-label={busy ? 'Cancel and close' : 'Close'}
              className="bg-background text-text-muted hover:bg-background-alt flex size-8 items-center justify-center rounded-full transition-colors"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <input
            ref={picker}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              choose(e.target.files);
              e.target.value = '';
            }}
          />

          {upload.phase === 'idle' && (
            <ChooseStep
              files={files}
              previews={previews}
              max={max}
              notice={notice}
              name={name}
              album={album}
              gallery={gallery}
              uploaderName={uploaderName}
              onPick={() => picker.current?.click()}
              onClear={() => {
                setFiles([]);
                setNotice(null);
              }}
              onName={setName}
              onAlbum={setAlbum}
              onUpload={() =>
                upload.start(files, {
                  albumEventId: album || null,
                  uploaderName: name.trim() || null,
                })
              }
            />
          )}

          {upload.phase === 'uploading' && (
            <ProgressStep upload={upload} onCancel={() => close(false)} />
          )}

          {upload.phase === 'full' && <FullStep items={upload.items} done={upload.done} />}

          {(upload.phase === 'finished' ||
            upload.phase === 'closed' ||
            upload.phase === 'failed') && (
            <DoneStep
              upload={upload}
              coupleName={gallery.weddingName}
              onView={() => {
                close(false);
                onViewGallery();
              }}
              onMore={() => {
                startOver();
                picker.current?.click();
              }}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ChooseStep({
  files,
  previews,
  max,
  notice,
  name,
  album,
  gallery,
  onPick,
  onClear,
  onName,
  onAlbum,
  onUpload,
  uploaderName,
}: {
  files: File[];
  previews: string[];
  max: number;
  notice: string | null;
  name: string;
  album: string;
  gallery: Props['gallery'];
  uploaderName?: string;
  onPick: () => void;
  onClear: () => void;
  onName: (v: string) => void;
  onAlbum: (v: string) => void;
  onUpload: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onPick}
        className="bg-background-alt relative mt-2 flex flex-col items-center justify-center overflow-hidden rounded-2xl p-4 text-center shadow-sm transition-all active:scale-[0.99]"
      >
        <span className="bg-gold absolute inset-x-0 top-0 h-0.5" />
        <span className="bg-pending-bg text-gold-deep mb-2.5 flex size-12 items-center justify-center rounded-full">
          <ImagePlus aria-hidden className="size-6" />
        </span>
        <span className="text-primary font-semibold">Choose photos</span>
        <span className="text-text-muted mt-0.5 text-sm">
          JPG, PNG, HEIC or WebP · Up to {max} at a time
        </span>
        <span className="bg-surface text-primary mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs shadow-sm">
          <Images aria-hidden className="text-gold-deep size-3.5" />
          Browse phone library
        </span>
      </button>
      {notice && <p className="text-pending-text mt-2 text-sm">{notice}</p>}

      {files.length > 0 && (
        <div className="mt-5 flex flex-col">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span className="bg-gold-deep size-2 rounded-full" />
              {files.length} {files.length === 1 ? 'photo' : 'photos'} selected
            </span>
            <span className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={onPick}
                className="text-gold-deep font-medium hover:underline"
              >
                Edit selection
              </button>
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={onClear}
                className="text-text-muted hover:text-danger-text"
              >
                Clear
              </button>
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
            {previews.map((url, i) => (
              <div
                key={url}
                className="bg-background-alt relative size-14 shrink-0 overflow-hidden rounded-xl shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview */}
                <img src={url} alt={files[i]?.name ?? ''} className="size-full object-cover" />
                <span className="bg-primary/80 absolute top-1 right-1 flex size-3.5 items-center justify-center rounded-full text-white">
                  <Check aria-hidden className="size-2.5" />
                </span>
              </div>
            ))}
            {files.length > 4 && (
              <div className="bg-primary flex size-14 shrink-0 flex-col items-center justify-center rounded-xl text-white shadow-sm">
                <span className="font-semibold">+{files.length - 4}</span>
                <span className="text-[10px] leading-none text-white/70">more</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3.5">
        {uploaderName ? (
          <p className="text-text-muted flex items-center gap-1.5 text-sm">
            <User aria-hidden className="size-4" />
            Added as <strong className="text-text font-medium">{uploaderName}</strong>
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="uploader-name"
              className="flex items-center justify-between text-xs font-medium"
            >
              <span>Your name (optional)</span>
              <span className="text-text-muted font-normal">Helps the couple remember</span>
            </label>
            <div className="relative flex items-center">
              <User aria-hidden className="text-text-muted absolute left-3.5 size-4" />
              <input
                id="uploader-name"
                value={name}
                maxLength={MAX_UPLOADER_NAME}
                autoComplete="name"
                placeholder="e.g. Sana Aunty or Kabir"
                onChange={(e) => onName(e.target.value)}
                className="bg-background-alt focus:bg-surface focus:ring-primary h-11 w-full rounded-lg pr-3.5 pl-10 shadow-sm outline-none focus:ring-1"
              />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="album-select" className="text-xs font-medium">
            Album
          </label>
          <div className="relative flex items-center">
            <Folder aria-hidden className="text-text-muted absolute left-3.5 size-4" />
            <select
              id="album-select"
              value={album}
              onChange={(e) => onAlbum(e.target.value)}
              className="bg-background-alt focus:bg-surface focus:ring-primary h-11 w-full appearance-none rounded-lg pr-10 pl-10 font-medium shadow-sm outline-none focus:ring-1"
            >
              {gallery.albums.map((a) => (
                <option key={a.albumEventId ?? 'general'} value={a.albumEventId ?? ''}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col">
        <button
          type="button"
          disabled={files.length === 0}
          onClick={onUpload}
          className="bg-primary hover:bg-primary/90 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <CloudUpload aria-hidden className="size-5" />
          {files.length === 0
            ? 'Upload photos'
            : `Upload ${files.length} ${files.length === 1 ? 'photo' : 'photos'}`}
        </button>
        <p className="text-text-muted mt-3 flex items-start justify-center gap-1.5 px-4 text-center text-xs leading-tight">
          <Lock aria-hidden className="text-gold-deep mt-0.5 size-3.5 shrink-0" />
          Photos go straight to {gallery.weddingName}&apos;s private wedding gallery.
        </p>
      </div>
    </>
  );
}

function Tile({ item, onRetry }: { item: UploadItem; onRetry?: () => void }) {
  return (
    <div
      className={cn(
        'bg-background-alt relative aspect-square overflow-hidden rounded-lg',
        item.status === 'error' && 'bg-danger-bg',
      )}
    >
      {item.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a local preview
        <img
          src={item.previewUrl}
          alt=""
          className={cn(
            'absolute inset-0 size-full object-cover',
            item.status === 'uploading' && 'brightness-75',
            item.status === 'error' && 'opacity-20',
          )}
        />
      )}
      {item.status === 'done' && (
        <span className="bg-primary/25 absolute inset-0 flex items-center justify-center">
          <span className="bg-surface text-primary flex size-6 items-center justify-center rounded-full shadow-md">
            <Check aria-hidden className="size-4" />
          </span>
        </span>
      )}
      {(item.status === 'uploading' || item.status === 'preparing') && (
        <span className="bg-primary/30 absolute inset-0 flex items-center justify-center">
          <span className="border-t-gold size-7 animate-spin rounded-full border-2 border-white/30" />
        </span>
      )}
      {item.status === 'queued' && (
        <span className="text-text-muted absolute inset-0 flex flex-col items-center justify-center">
          <Hourglass aria-hidden className="size-5" />
          <span className="mt-0.5 text-[10px]">Queue</span>
        </span>
      )}
      {item.status === 'error' && (
        <span className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
          <CircleAlert aria-hidden className="text-danger-text mb-0.5 size-4" />
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              title={item.error ?? undefined}
              className="bg-surface text-danger-text rounded-full px-1.5 py-0.5 text-[10px] leading-tight shadow-sm"
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}

function ProgressStep({
  upload,
  onCancel,
}: {
  upload: ReturnType<typeof useGalleryUpload>;
  onCancel: () => void;
}) {
  const total = upload.items.length;
  const percent = Math.round(upload.progress * 100);
  const current = Math.min(total, upload.done + 1);
  return (
    <>
      <div className="bg-background-alt mb-4 rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">
            Uploading {current} of {total} {total === 1 ? 'photo' : 'photos'}
          </span>
          <span className="text-primary text-sm font-semibold">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
          className="bg-border relative h-2 w-full overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="mb-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-text-muted text-xs font-medium">Your photos</span>
          <span className="bg-background-alt text-gold-deep rounded-full px-2 py-0.5 text-[11px]">
            {upload.done} uploaded
            {upload.failed > 0 && ` • ${upload.failed} to retry`}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {upload.items.map((item) => (
            <Tile key={item.id} item={item} />
          ))}
        </div>
      </div>
      <div className="bg-background-alt mb-5 flex items-start gap-3 rounded-lg p-3">
        <RefreshCw aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
        <p className="text-text-muted text-sm">
          Keep this page open until it finishes. We&apos;ll retry automatically if your connection
          drops.
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="bg-background-alt hover:bg-border w-full rounded-full py-2.5 text-sm font-medium transition-colors"
      >
        Cancel upload
      </button>
    </>
  );
}

function FullStep({ items, done }: { items: UploadItem[]; done: number }) {
  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-2.5">
        {items.slice(0, 8).map((item) => (
          <Tile key={item.id} item={item} />
        ))}
      </div>
      <div className="bg-pending-bg text-pending-text mb-4 flex items-start gap-3 rounded-xl p-4">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">Gallery full</p>
          <p className="text-sm">
            The gallery is full, so new photos can&apos;t be added right now. Please let the couple
            know.
            {done > 0 && ` ${done} of your photos were added before it filled up.`}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled
        className="bg-border text-text-muted flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-medium"
      >
        <CloudOff aria-hidden className="size-5" />
        Upload ({items.length - done} {items.length - done === 1 ? 'photo' : 'photos'})
      </button>
    </>
  );
}

function DoneStep({
  upload,
  coupleName,
  onView,
  onMore,
}: {
  upload: ReturnType<typeof useGalleryUpload>;
  coupleName: string;
  onView: () => void;
  onMore: () => void;
}) {
  const added = upload.items.filter((i) => i.status === 'done');
  const failed = upload.items.filter((i) => i.status === 'error');
  return (
    <>
      <div className="my-4 flex flex-col items-center text-center">
        <span
          className={cn(
            'mb-4 flex size-16 items-center justify-center rounded-full shadow-lg',
            added.length > 0 ? 'bg-primary text-gold' : 'bg-danger-bg text-danger-text',
          )}
        >
          {added.length > 0 ? (
            <Check aria-hidden className="size-8" />
          ) : (
            <CircleAlert aria-hidden className="size-8" />
          )}
        </span>
        <h2 className="text-primary mb-2 text-[28px] leading-9">
          {added.length > 0
            ? `${added.length} ${added.length === 1 ? 'photo' : 'photos'} added. Thank you!`
            : upload.phase === 'closed'
              ? 'Uploads are closed'
              : "Your photos weren't added"}
        </h2>
        <p className="text-text-muted max-w-[300px]">
          {upload.phase === 'closed'
            ? `${coupleName} are no longer accepting new photos.`
            : added.length > 0
              ? `Your moments are now part of ${coupleName}'s wedding album.`
              : (upload.message ?? 'Check your connection and try again.')}
        </p>
      </div>
      {added.length > 0 && (
        <div className="bg-background-alt my-2 flex items-center justify-center gap-2 rounded-xl px-4 py-3">
          {added.slice(0, 3).map((item) => (
            <div key={item.id} className="size-12 overflow-hidden rounded-lg shadow-sm">
              {item.previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview
                <img src={item.previewUrl} alt="" className="size-full object-cover" />
              )}
            </div>
          ))}
          {added.length > 3 && (
            <div className="bg-background text-primary flex size-12 items-center justify-center rounded-lg text-xs font-medium shadow-sm">
              +{added.length - 3}
            </div>
          )}
        </div>
      )}
      {failed.length > 0 && upload.phase !== 'closed' && (
        <div className="bg-danger-bg text-danger-text mt-2 flex items-center justify-between gap-3 rounded-xl p-3 text-sm">
          <span>
            {failed.length} {failed.length === 1 ? "photo wasn't" : "photos weren't"} added.
          </span>
          <button
            type="button"
            onClick={() => upload.retry()}
            className="bg-surface rounded-full px-3 py-1 text-xs font-semibold shadow-sm"
          >
            Retry
          </button>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onView}
          className="bg-primary hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-medium text-white shadow-md transition-all"
        >
          View in gallery
          <ArrowRight aria-hidden className="size-4" />
        </button>
        {upload.phase !== 'closed' && (
          <button
            type="button"
            onClick={onMore}
            className="bg-surface hover:bg-background-alt text-primary border-border flex w-full items-center justify-center gap-2 rounded-full border py-3 text-sm font-medium transition-colors"
          >
            <Camera aria-hidden className="size-5" />
            Add more photos
          </button>
        )}
      </div>
      <p className="text-text-muted mt-6 text-center text-[11px] tracking-wider">
        Made with {APP_NAME}
      </p>
    </>
  );
}
