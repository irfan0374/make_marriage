'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CloudCheck, Lock, LockKeyhole, PartyPopper, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicGallery } from '@/modules/gallery/gallery.types';
import { cn } from '@/shared/cn';
import { getPublicGallery } from '../../api';
import { usePublicPhotos } from '../../hooks';
import { PhotoViewer } from '../photo-viewer';
import { AddPhotosSheet } from './add-photos-sheet';
import { WeddingLoader } from '@/components/common/wedding-loader';

// The guests' photo gallery (Stitch "Guest Photo Gallery (Home & Viewer)", desktop and phone,
// and "Guest Gallery States"): add photos without an account, browse albums, open a photo.

const card = 'bg-surface border-border rounded-2xl border shadow-card';

/** "N&I" from "Nafiya & Irfan". */
function monogram(name: string): string {
  return name
    .split('&')
    .map((part) => part.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join('&');
}

function AddButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'bg-primary hover:bg-primary/90 inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium tracking-wide text-white shadow-xl transition-all active:scale-95',
        className,
      )}
    >
      <Camera aria-hidden className="text-gold size-5" />
      Add photos
    </button>
  );
}

export function GuestGallery({ token, initial }: { token: string; initial: PublicGallery }) {
  const queryClient = useQueryClient();
  const { data: gallery = initial } = useQuery({
    queryKey: ['gallery', token],
    queryFn: () => getPublicGallery(token),
    initialData: initial,
    staleTime: 60_000,
  });
  const [album, setAlbum] = useState<string | null>(null);
  const [sheet, setSheet] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const photos = usePublicPhotos(token, album, gallery.guestViewing);
  const list = photos.data?.pages.flatMap((p) => p.items) ?? [];
  const albumCount =
    album === null
      ? gallery.photoCount
      : (gallery.albums.find((a) => (a.albumEventId ?? 'general') === album)?.count ?? null);

  // Load more as the end of the grid comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = photos;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['gallery', token] });
  }, [queryClient, token]);
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const open = gallery.uploadsOpen;
  const openSheet = () => setSheet((n) => n + 1);

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-[1200px] flex-1 pb-28 md:px-6 md:py-8 md:pb-12">
        <header className="flex items-center gap-3 px-4 py-3 md:px-0 md:pb-6">
          <span className="bg-primary flex size-10 items-center justify-center rounded-full shadow-sm">
            <span className="font-heading text-gold text-sm tracking-wide italic">
              {monogram(gallery.weddingName)}
            </span>
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-primary text-xl leading-tight">
              {gallery.weddingName}
            </span>
            <span className="text-text-muted text-[11px] font-medium">Guest Photo Gallery</span>
          </span>
        </header>

        <div className="space-y-4 px-4 md:space-y-8 md:px-0">
          <section
            className={cn(
              card,
              'flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center md:p-7',
            )}
          >
            <div className="max-w-2xl space-y-1.5">
              <span className="text-gold-deep text-[11px] font-semibold tracking-wider uppercase">
                Guest album
              </span>
              <h1 className="text-primary text-[26px] leading-tight md:text-3xl">
                Share your photos with us
              </h1>
              <p className="text-text-muted text-sm leading-relaxed">
                Add the moments you captured. No app or sign-up needed.
              </p>
            </div>
            <div className="hidden shrink-0 md:block">
              {open ? <AddButton onClick={openSheet} className="shadow-md" /> : <ClosedBadge />}
            </div>
          </section>

          {!gallery.guestViewing ? (
            <section className={cn(card, 'flex flex-col items-center p-8 text-center')}>
              <span className="bg-background-alt text-primary mb-4 flex size-14 items-center justify-center rounded-full">
                <LockKeyhole aria-hidden className="size-6" />
              </span>
              <h2 className="text-primary text-xl">The couple will share the photos later</h2>
              <p className="text-text-muted mt-1 max-w-sm text-sm">
                Your photos go straight to their private album. They&apos;ll share the collection
                once the celebrations wrap up.
              </p>
              <p className="text-text-muted mt-4 flex items-center gap-1.5 text-xs">
                <ShieldCheck aria-hidden className="text-gold-deep size-4" />
                Your uploads stay private
              </p>
              {!open && <ClosedNotice className="mt-6" />}
            </section>
          ) : (
            <>
              <section aria-label="Albums" className="space-y-3">
                <div
                  role="group"
                  aria-label="Choose an album"
                  className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
                >
                  {[
                    { id: null, name: 'All', count: gallery.photoCount },
                    ...gallery.albums.map((a) => ({
                      id: a.albumEventId ?? 'general',
                      name: a.name,
                      count: a.count,
                    })),
                  ].map((chip) => {
                    const selected = album === chip.id;
                    return (
                      <button
                        key={chip.id ?? 'all'}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setAlbum(chip.id);
                          setViewer(null);
                        }}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium shadow-sm transition-all md:py-2',
                          selected
                            ? 'bg-primary text-white'
                            : 'bg-surface text-text-muted hover:bg-background-alt md:border-border md:text-text md:border',
                        )}
                      >
                        {chip.name}
                        {chip.count !== null && (
                          <span
                            className={cn(
                              'hidden text-[11px] md:inline',
                              selected ? 'opacity-75' : 'text-text-muted',
                            )}
                          >
                            ({chip.count.toLocaleString('en-IN')})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="bg-gold-deep size-2 animate-pulse rounded-full" />
                  <span className="text-text-muted">
                    {(albumCount ?? list.length).toLocaleString('en-IN')}{' '}
                    {albumCount === 1 ? 'photo' : 'photos'} shared
                  </span>
                </p>
              </section>

              {!open && <ClosedNotice className="md:hidden" />}

              {photos.isPending ? (
                <WeddingLoader label="Loading photos" size="section" />
              ) : photos.isError ? (
                <div role="alert" className="py-16 text-center">
                  <p className="text-text-muted text-sm">We couldn&apos;t load the photos.</p>
                  <button
                    type="button"
                    onClick={() => void photos.refetch()}
                    className="text-primary mt-2 text-sm font-medium hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : list.length === 0 ? (
                <EmptyState open={open} onAdd={openSheet} />
              ) : (
                <section aria-label="Photos">
                  <ul className="-mx-4 grid grid-cols-3 gap-1 md:mx-0 md:grid-cols-5 md:gap-2">
                    {list.map((photo, i) => (
                      <li key={photo.id}>
                        <button
                          type="button"
                          onClick={() => setViewer(i)}
                          aria-label={`Open photo ${i + 1}${photo.uploaderName ? `, shared by ${photo.uploaderName}` : ''}`}
                          className="group bg-background-alt relative block aspect-square w-full overflow-hidden md:rounded-lg"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
                          <img
                            src={photo.thumbUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div ref={sentinel} />
                  {(hasNextPage || isFetchingNextPage) && (
                    <WeddingLoader label="Loading more memories" size="inline" />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {open && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 md:hidden">
          <AddButton onClick={openSheet} className="pointer-events-auto" />
        </div>
      )}

      <PhotoViewer
        photos={list}
        index={viewer}
        total={albumCount}
        onIndex={setViewer}
        onClose={() => setViewer(null)}
        onNearEnd={loadMore}
      />

      {sheet > 0 && (
        <AddPhotosSheet
          key={sheet}
          open
          onOpenChange={(next) => !next && setSheet(0)}
          target={{ kind: 'guest', token }}
          gallery={gallery}
          defaultAlbum={album === 'general' ? null : album}
          onUploaded={refresh}
          onViewGallery={() => {
            setAlbum(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}
    </div>
  );
}

function ClosedBadge() {
  return (
    <span className="bg-background border-border text-text-muted inline-flex items-center gap-2 rounded-full border px-5 py-3 text-xs font-semibold">
      <Lock aria-hidden className="size-4" />
      Uploads are closed
    </span>
  );
}

function ClosedNotice({ className }: { className?: string }) {
  return (
    <div className={cn('bg-background-alt rounded-xl p-4 text-center', className)}>
      <p className="text-text-muted flex items-center justify-center gap-1.5 text-sm font-medium">
        <Lock aria-hidden className="size-4" />
        Uploads are closed
      </p>
    </div>
  );
}

function EmptyState({ open, onAdd }: { open: boolean; onAdd: () => void }) {
  return (
    <section className={cn(card, 'flex flex-col items-center p-8 text-center')}>
      <span className="bg-background-alt text-gold-deep mb-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium">
        <PartyPopper aria-hidden className="size-3.5" />
        Welcome to the wedding album
      </span>
      <span className="bg-primary-tint text-primary my-4 flex size-16 items-center justify-center rounded-full">
        <Camera aria-hidden className="size-7" />
      </span>
      <h2 className="text-primary text-2xl">
        {open ? 'No photos yet — be the first to add one' : 'No photos yet'}
      </h2>
      <p className="text-text-muted mt-1 max-w-sm text-sm">
        Capture a smile, the rituals, or a candid memory from the celebration.
      </p>
      {open && (
        <>
          <AddButton onClick={onAdd} className="mt-6 shadow-md" />
          <span className="text-text-muted mt-3 flex items-center gap-1.5 text-xs">
            <CloudCheck aria-hidden className="size-4" />
            No app download required
          </span>
        </>
      )}
    </section>
  );
}
