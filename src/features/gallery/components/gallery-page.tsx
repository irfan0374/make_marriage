'use client';

import { Menu } from '@base-ui/react/menu';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CloudDownload,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderInput,
  ImagePlus,
  Link2,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useMe, useWedding } from '@/features/weddings/hooks';
import {
  MAX_DISPLAY_BYTES,
  MAX_FILES_PER_REQUEST,
  MAX_THUMB_BYTES,
} from '@/modules/gallery/gallery.schemas';
import type { GalleryOverview, Photo } from '@/modules/gallery/gallery.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { formatFullDate } from '@/shared/dates';
import { qrUrl } from '../api';
import {
  galleryKey,
  useBulkPhotos,
  useGallery,
  usePhotos,
  useRegenerateLink,
  useUpdateGallery,
} from '../hooks';
import { useZipDownload } from '../use-zip-download';
import { AddPhotosSheet } from './guest/add-photos-sheet';
import { PhotoViewer } from './photo-viewer';
import { ZipDialog } from './zip-dialog';
import { WeddingLoader } from '@/components/common/wedding-loader';

// The couple's Photo Gallery (Stitch "Photo Gallery"; PRD §5.10): share the link, QR code and
// print card, the gallery's switches and storage, every photo guests added to hide, move or
// delete, the team's own uploads, and downloads as ZIPs (everything, an album or a selection).

const card = 'border-border bg-surface rounded-card shadow-card border';

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';

/** "1.2 GB", "340 MB". */
function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n === 0) return '0 MB';
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const bareUrl = (url: string) => url.replace(/^https?:\/\//, '');

export function GalleryPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: gallery, error, isPending, refetch } = useGallery(weddingId);
  const queryClient = useQueryClient();
  const refreshGallery = () => queryClient.invalidateQueries({ queryKey: galleryKey(weddingId) });
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const query = new URLSearchParams(
    filter === 'all' ? {} : filter === 'hidden' ? { hidden: 'true' } : { album: filter },
  );
  const photos = usePhotos(weddingId, query);
  const zip = useZipDownload(weddingId);
  const { data: me } = useMe();
  const [uploading, setUploading] = useState(0);
  const list = photos.data?.pages.flatMap((p) => p.items) ?? [];

  if (isPending || !wedding) {
    return <WeddingLoader label="Loading your gallery" size="page" />;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your gallery</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const isAdmin = wedding.me.role === 'admin';
  const readOnly = wedding.status === 'archived';
  const counts = gallery.counts;
  const shownCount =
    filter === 'all'
      ? counts.total
      : filter === 'hidden'
        ? counts.hidden
        : (counts.byAlbum.find((a) => (a.albumEventId ?? 'general') === filter)?.count ?? 0);

  const filterName =
    filter === 'hidden'
      ? 'hidden'
      : (counts.byAlbum.find((a) => (a.albumEventId ?? 'general') === filter)?.name ?? 'album');
  const couple = `${wedding.brideName} & ${wedding.groomName}`;
  const downloadLabel = filter === 'all' ? `${couple} photos` : `${couple} ${filterName}`;

  function pick(next: string) {
    setFilter(next);
    setSelected(new Set());
    setViewer(null);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8 pb-16">
      <header className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div className="flex max-w-2xl flex-col gap-1">
          <span className="text-gold-deep text-[11px] font-semibold tracking-widest uppercase">
            Media &amp; Memories
          </span>
          <h1 className="text-4xl font-normal tracking-tight md:text-5xl">Photo Gallery</h1>
          <p className="text-text-muted">
            Collect, curate and share the candid moments your guests capture at every ceremony.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={shownCount === 0 || zip.progress.status === 'working'}
            onClick={() => void zip.start({ album: filter, cursor: null }, downloadLabel)}
            className="bg-background-alt text-primary hover:bg-border inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            <CloudDownload aria-hidden className="size-4" />
            {filter === 'all'
              ? `Download all (${counts.total.toLocaleString('en-IN')})`
              : `Download ${filterName} (${shownCount.toLocaleString('en-IN')})`}
          </button>
          {!readOnly && (
            <Button className="h-10 gap-1.5 px-5" onClick={() => setUploading((n) => n + 1)}>
              <ImagePlus aria-hidden className="size-4" />
              Upload photos
            </Button>
          )}
        </div>
      </header>

      {readOnly && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input px-4 py-3 text-sm"
        >
          This wedding is archived: uploads are closed and photos can&apos;t be changed. Guests can
          still see the gallery if viewing is on.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <ShareCard weddingId={weddingId} gallery={gallery} isAdmin={isAdmin} readOnly={readOnly} />
        <SettingsCard
          weddingId={weddingId}
          gallery={gallery}
          isAdmin={isAdmin}
          readOnly={readOnly}
        />
      </div>

      <div
        role="group"
        aria-label="Albums"
        className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {[
          { id: 'all', name: 'All', count: counts.total },
          ...counts.byAlbum.map((a) => ({
            id: a.albumEventId ?? 'general',
            name: a.name,
            count: a.count,
          })),
        ].map((chip) => (
          <Chip key={chip.id} selected={filter === chip.id} onClick={() => pick(chip.id)}>
            {chip.name} ({chip.count.toLocaleString('en-IN')})
          </Chip>
        ))}
        <Chip selected={filter === 'hidden'} onClick={() => pick('hidden')}>
          <EyeOff aria-hidden className="size-3.5" />
          Hidden ({counts.hidden.toLocaleString('en-IN')})
        </Chip>
      </div>

      {selected.size > 0 && (
        <SelectionBar
          weddingId={weddingId}
          selected={[...selected]}
          photos={list}
          albums={counts.byAlbum}
          readOnly={readOnly}
          onClear={() => setSelected(new Set())}
          downloading={zip.progress.status === 'working'}
          onDownload={() => void zip.start({ photoIds: [...selected] }, `${couple} selected`)}
        />
      )}

      {photos.isPending ? (
        <WeddingLoader label="Loading photos" size="section" />
      ) : list.length === 0 ? (
        <EmptyGrid filter={filter} url={gallery.url} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {list.map((photo, i) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              selected={selected.has(photo.id)}
              selecting={selected.size > 0}
              timeZone={wedding.timezone}
              onToggle={() => toggle(photo.id)}
              onOpen={() => setViewer(i)}
            />
          ))}
        </ul>
      )}

      {list.length > 0 && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <span className="text-text-muted text-sm font-medium">
            Showing {list.length.toLocaleString('en-IN')} of {shownCount.toLocaleString('en-IN')}{' '}
            photos
          </span>
          {photos.hasNextPage && (
            <button
              type="button"
              onClick={() => void photos.fetchNextPage()}
              disabled={photos.isFetchingNextPage}
              className="bg-background-alt text-primary hover:bg-border inline-flex items-center gap-1.5 rounded-full px-8 py-2.5 text-sm font-medium shadow-sm transition-colors"
            >
              <ChevronDown aria-hidden className="size-4" />
              {photos.isFetchingNextPage ? 'Loading…' : 'Load more memories'}
            </button>
          )}
        </div>
      )}

      <div className="bg-background-alt rounded-card flex items-center gap-4 p-4 shadow-sm">
        <span className="bg-surface text-gold-deep flex size-10 shrink-0 items-center justify-center rounded-full shadow-sm">
          <ShieldCheck aria-hidden className="size-5" />
        </span>
        <p className="text-text-muted text-sm leading-relaxed">
          Photos are kept until{' '}
          <strong className="text-text font-semibold">
            {formatFullDate(gallery.filesDeleteOn)}
          </strong>{' '}
          (1 year after the wedding). Download your full wedding album before then.
        </p>
      </div>

      <ZipDialog progress={zip.progress} onCancel={zip.cancel} onClose={zip.close} />

      {uploading > 0 && (
        <AddPhotosSheet
          key={uploading}
          open
          onOpenChange={(next) => !next && setUploading(0)}
          target={{ kind: 'team', weddingId }}
          uploaderName={me?.user.name}
          gallery={{
            weddingName: couple,
            albums: counts.byAlbum.map((a) => ({ ...a, count: a.count })),
            limits: {
              maxFilesPerRequest: MAX_FILES_PER_REQUEST,
              maxDisplayBytes: MAX_DISPLAY_BYTES,
              maxThumbBytes: MAX_THUMB_BYTES,
            },
          }}
          defaultAlbum={
            filter === 'all' || filter === 'hidden' || filter === 'general' ? null : filter
          }
          onUploaded={() => void refreshGallery()}
          onViewGallery={() => pick('all')}
        />
      )}

      <PhotoViewer
        photos={list}
        index={viewer}
        total={shownCount}
        onIndex={setViewer}
        onClose={() => setViewer(null)}
        onNearEnd={() => {
          if (photos.hasNextPage && !photos.isFetchingNextPage) void photos.fetchNextPage();
        }}
        timeZone={wedding.timezone}
      />
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap shadow-sm transition-colors',
        selected ? 'bg-primary text-primary-foreground' : 'bg-surface hover:bg-background-alt',
      )}
    >
      {children}
    </button>
  );
}

function ShareCard({
  weddingId,
  gallery,
  isAdmin,
  readOnly,
}: {
  weddingId: string;
  gallery: GalleryOverview;
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(gallery.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is selectable.
    }
  }

  return (
    <section className={cn(card, 'flex flex-col gap-4 p-6 lg:col-span-7')}>
      <div className="flex flex-col gap-1">
        <h2 className="text-primary flex items-center gap-2 text-2xl">
          <QrCode aria-hidden className="text-gold-deep size-5" />
          Share with guests
        </h2>
        <p className="text-text-muted max-w-xl text-sm">
          Guests can scan the code at their tables or open the link to add their photos straight
          into the event albums.
        </p>
      </div>
      <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
        <div className="bg-background-alt flex flex-col items-center justify-center rounded-lg p-2 sm:col-span-4">
          <div className="bg-surface relative flex size-28 items-center justify-center rounded-md p-1.5 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated by our API */}
            <img
              src={qrUrl(weddingId, 'svg')}
              key={gallery.url}
              alt="QR code for the gallery link"
              className="size-full"
            />
          </div>
          <span className="text-text-muted mt-1.5 text-[10px] font-medium tracking-wider uppercase">
            Table scan QR
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-8">
          <div className="bg-background-alt flex items-center gap-2 rounded-lg p-1.5 pl-3">
            <Link2 aria-hidden className="text-text-muted size-4 shrink-0" />
            <span className="flex-1 truncate font-mono text-sm select-all">
              {bareUrl(gallery.url)}
            </span>
            <button
              type="button"
              onClick={() => void copy()}
              className="bg-surface text-primary hover:bg-primary-tint flex items-center gap-1 rounded px-2 py-1 text-xs font-medium shadow-sm transition-colors"
            >
              {copied ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Copy aria-hidden className="size-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={qrUrl(weddingId, 'png')}
              download="gallery-qr.png"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition-colors"
            >
              <Download aria-hidden className="size-4" />
              Download QR
            </a>
            <a
              href={qrUrl(weddingId, 'svg')}
              download="gallery-qr.svg"
              className="text-primary text-xs font-medium hover:underline"
            >
              SVG
            </a>
            <a
              href={`/print/gallery/${weddingId}`}
              target="_blank"
              rel="noopener"
              className="bg-background-alt hover:bg-border inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
            >
              <Printer aria-hidden className="size-4" />
              Print QR card
            </a>
          </div>
          {isAdmin && !readOnly && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-primary inline-flex w-fit items-center gap-1 text-xs font-medium opacity-80 hover:underline hover:opacity-100"
            >
              <RefreshCw aria-hidden className="size-3.5" />
              Regenerate link
            </button>
          )}
        </div>
      </div>
      {confirming && (
        <RegenerateDialog weddingId={weddingId} onClose={() => setConfirming(false)} />
      )}
    </section>
  );
}

function RegenerateDialog({ weddingId, onClose }: { weddingId: string; onClose: () => void }) {
  const regenerate = useRegenerateLink(weddingId);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Make a new gallery link?"
      description="The current link and every printed or shared QR code stop working at once. Photos already added stay in the gallery."
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep this link
          </Button>
          <Button
            className="h-11 px-6"
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSuccess: onClose })}
          >
            {regenerate.isPending ? 'Making a new link…' : 'Make a new link'}
          </Button>
        </>
      }
    >
      <FormAlert message={regenerate.error ? messageOf(regenerate.error) : null} />
    </Dialog>
  );
}

function SettingsCard({
  weddingId,
  gallery,
  isAdmin,
  readOnly,
}: {
  weddingId: string;
  gallery: GalleryOverview;
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const update = useUpdateGallery(weddingId);
  const { usedBytes, reservedBytes, capBytes } = gallery.storage;
  const used = usedBytes + reservedBytes;
  const percent = Math.min(100, Math.round((used / capBytes) * 100));
  const disabled = !isAdmin || readOnly || update.isPending;

  const row = (label: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-text-muted text-sm">{hint}</span>
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );

  return (
    <section className={cn(card, 'flex flex-col justify-between gap-4 p-6 lg:col-span-5')}>
      <h2 className="text-primary flex items-center gap-2 text-2xl">
        <SlidersHorizontal aria-hidden className="text-gold-deep size-5" />
        Settings &amp; Storage
      </h2>
      <div className="flex flex-col gap-3">
        {row(
          'Guests can upload photos',
          'Anyone with the QR code or link can add photos',
          gallery.uploadsOpen,
          (uploadsOpen) => update.mutate({ uploadsOpen }),
        )}
        {row(
          'Guests can view all photos',
          'Off: guests can add photos but only your team sees them',
          gallery.guestViewing,
          (guestViewing) => update.mutate({ guestViewing }),
        )}
        {!isAdmin && (
          <p className="text-text-muted text-xs">Only Admins can change these settings.</p>
        )}
        <FormAlert message={update.error ? messageOf(update.error) : null} />
      </div>
      <div className="bg-background-alt flex flex-col gap-1.5 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Storage</span>
          <span className="text-text-muted font-mono">
            {bytes(used)} / {bytes(capBytes)} ({percent}%)
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Storage used"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="bg-border h-1.5 w-full overflow-hidden rounded-full"
        >
          <div
            className={cn('h-full rounded-full', percent >= 90 ? 'bg-danger-text' : 'bg-primary')}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function SelectionBar({
  weddingId,
  selected,
  photos,
  albums,
  readOnly,
  onClear,
  downloading,
  onDownload,
}: {
  weddingId: string;
  downloading: boolean;
  onDownload: () => void;
  selected: string[];
  photos: Photo[];
  albums: GalleryOverview['counts']['byAlbum'];
  readOnly: boolean;
  onClear: () => void;
}) {
  const bulk = useBulkPhotos(weddingId);
  const [deleting, setDeleting] = useState(false);
  const chosen = photos.filter((p) => selected.includes(p.id));
  const allHidden = chosen.length > 0 && chosen.every((p) => p.hidden);
  const n = selected.length;
  const button =
    'bg-white/10 hover:bg-white/20 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50';

  function run(input: Parameters<typeof bulk.mutate>[0]) {
    bulk.mutate(input, { onSuccess: onClear });
  }

  return (
    <div className="bg-primary sticky top-20 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-white shadow-xl sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-medium">
          <CheckCircle2 aria-hidden className="text-gold size-5" />
          {n} {n === 1 ? 'photo' : 'photos'} selected
        </span>
        <span className="h-4 w-px bg-white/30" />
        <button type="button" onClick={onClear} className="text-xs text-white/80 hover:underline">
          Clear selection
        </button>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={button}
            disabled={bulk.isPending}
            onClick={() => run({ action: allHidden ? 'unhide' : 'hide', photoIds: selected })}
          >
            {allHidden ? (
              <Eye aria-hidden className="size-4" />
            ) : (
              <EyeOff aria-hidden className="size-4" />
            )}
            <span className="hidden sm:inline">
              {allHidden ? 'Show to guests' : 'Hide from guests'}
            </span>
          </button>
          <Menu.Root>
            <Menu.Trigger className={button} disabled={bulk.isPending}>
              <FolderInput aria-hidden className="size-4" />
              Move to album
              <ChevronDown aria-hidden className="size-3.5" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner align="end" sideOffset={8} className="z-40">
                <Menu.Popup className="border-border bg-surface rounded-card min-w-48 border p-1.5 shadow-lg outline-none">
                  {albums.map((a) => (
                    <Menu.Item
                      key={a.albumEventId ?? 'general'}
                      onClick={() =>
                        run({ action: 'move', photoIds: selected, albumEventId: a.albumEventId })
                      }
                      className="data-[highlighted]:bg-background-alt flex cursor-pointer rounded-md px-3 py-2 text-sm outline-none"
                    >
                      {a.name}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <button
            type="button"
            className="bg-danger-bg text-danger-text inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={bulk.isPending}
            onClick={() => setDeleting(true)}
          >
            <Trash2 aria-hidden className="size-4" />
            Delete
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="bg-gold-deep inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Download aria-hidden className="size-4" />
        Download ({n})
      </button>
      {bulk.error && (
        <p role="alert" className="w-full text-sm text-white">
          {messageOf(bulk.error)}
        </p>
      )}
      {deleting && (
        <Dialog
          open
          onOpenChange={(open) => !open && setDeleting(false)}
          title={`Delete ${n} ${n === 1 ? 'photo' : 'photos'}?`}
          description="They're removed from the gallery for everyone and can't be brought back."
          footer={
            <>
              <Button variant="outline" className="h-11 px-6" onClick={() => setDeleting(false)}>
                Keep {n === 1 ? 'it' : 'them'}
              </Button>
              <Button
                variant="destructive"
                className="h-11 px-6"
                disabled={bulk.isPending}
                onClick={() =>
                  bulk.mutate(
                    { action: 'delete', photoIds: selected },
                    {
                      onSuccess: () => {
                        setDeleting(false);
                        onClear();
                      },
                    },
                  )
                }
              >
                {bulk.isPending ? 'Deleting…' : `Delete ${n === 1 ? 'photo' : 'photos'}`}
              </Button>
            </>
          }
        >
          <FormAlert message={bulk.error ? messageOf(bulk.error) : null} />
        </Dialog>
      )}
    </div>
  );
}

function PhotoTile({
  photo,
  selected,
  selecting,
  timeZone,
  onToggle,
  onOpen,
}: {
  photo: Photo;
  selected: boolean;
  selecting: boolean;
  timeZone: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const when = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(photo.uploadedAt));
  const who = photo.uploaderName ?? 'Guest';
  return (
    <li
      className={cn(
        'group bg-background-alt relative aspect-[3/4] overflow-hidden rounded-xl shadow-sm transition-transform duration-200 hover:-translate-y-1',
        photo.hidden && !selected && 'opacity-80 hover:opacity-100',
        selected && 'shadow-md',
      )}
    >
      <button
        type="button"
        onClick={selecting ? onToggle : onOpen}
        aria-label={`${selecting ? (selected ? 'Unselect' : 'Select') : 'Open'} photo by ${who}, ${photo.albumName}`}
        className="absolute inset-0 size-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
        <img src={photo.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
      </button>
      <div
        className={cn(
          'from-primary/80 pointer-events-none absolute inset-0 bg-gradient-to-t via-transparent to-transparent transition-opacity',
          selected
            ? 'opacity-100'
            : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      />
      {photo.hidden && (
        <span className="bg-background/90 text-text-muted pointer-events-none absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm">
          <EyeOff aria-hidden className="size-3" />
          Hidden
        </span>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select photo by ${who}`}
        onClick={onToggle}
        className={cn(
          'absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full shadow transition-opacity',
          selected
            ? 'bg-primary text-primary-foreground opacity-100'
            : 'bg-surface/85 text-primary opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
          selecting && 'opacity-100',
        )}
      >
        {selected ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <span className="border-primary size-3 rounded-sm border" />
        )}
      </button>
      {selected && (
        <span className="ring-primary pointer-events-none absolute inset-0 rounded-xl ring-[3px] ring-inset" />
      )}
      <div
        className={cn(
          'pointer-events-none absolute right-2 bottom-2 left-2 flex flex-col text-white transition-opacity',
          selected
            ? 'opacity-100'
            : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        <span className="truncate text-xs font-semibold">
          {who} · {photo.albumName}
        </span>
        <span className="text-[10px] opacity-80">
          {when} · {bytes(photo.sizeBytes)}
        </span>
      </div>
    </li>
  );
}

function EmptyGrid({ filter, url }: { filter: string; url: string }) {
  return (
    <div className={cn(card, 'flex flex-col items-center p-10 text-center')}>
      <span className="bg-primary-tint text-primary mb-4 flex size-14 items-center justify-center rounded-full">
        <ImagePlus aria-hidden className="size-6" />
      </span>
      <h2 className="text-2xl">
        {filter === 'hidden'
          ? 'No hidden photos'
          : filter === 'all'
            ? 'No photos yet'
            : 'No photos in this album yet'}
      </h2>
      {filter === 'all' && (
        <p className="text-text-muted mt-1 max-w-md text-sm">
          Share the QR code or the link <span className="font-mono text-xs">{bareUrl(url)}</span>{' '}
          with your guests, and their photos will appear here.
        </p>
      )}
    </div>
  );
}
