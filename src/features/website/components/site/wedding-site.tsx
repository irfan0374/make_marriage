import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Gem,
  Images,
  MapPin,
  PlayCircle,
  Radio,
  Shirt,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { APP_NAME } from '@/config/app';
import type { PublicSite, PublicSiteEvent } from '@/modules/website/website.types';
import { cn } from '@/shared/cn';
import {
  coupleOf,
  dayLabels,
  directionsUrl,
  formatFullDate,
  monogramOf,
  partOfDay,
  timeRange,
  venueLines,
} from '../../format';
import { DaysToGo } from './days-to-go';
import { LiveStream } from './live-stream';
import { PhotoGallery } from './photo-gallery';

// The public wedding website `/w/{slug}` (PRD §5.9) in the couple's theme, built from the Stitch
// "Wedding Website" Classic, Elegant and Modern screens. Sections the couple turned off are
// left out, along with their links.

export interface SitePreview {
  /** Where "Back to editor" goes. */
  editorHref: string;
  published: boolean;
}

interface WeddingSiteProps {
  site: PublicSite;
  /** The team's preview: a banner above the page. */
  preview?: SitePreview;
}

interface Anchor {
  id: string;
  label: string;
}

function anchorsOf(site: PublicSite): Anchor[] {
  return [
    site.story && { id: 'story', label: 'Our Story' },
    site.events && site.events.length > 0 && { id: 'events', label: 'Events' },
    site.photoUrls && { id: 'photos', label: 'Photos' },
    site.liveStream && { id: 'live', label: 'Live Stream' },
    site.galleryUrl && { id: 'gallery', label: 'Photo Gallery' },
  ].filter((a): a is Anchor => Boolean(a));
}

export function WeddingSite({ site, preview }: WeddingSiteProps) {
  const anchors = anchorsOf(site);
  const Theme =
    site.theme === 'elegant' ? ElegantSite : site.theme === 'modern' ? ModernSite : ClassicSite;
  return (
    <div
      className="wedding-site bg-background text-text min-h-screen"
      style={{ '--site-accent': site.accentColor } as React.CSSProperties}
    >
      <header className="bg-background/85 shadow-chrome fixed inset-x-0 top-0 z-50 backdrop-blur-xl">
        {preview && <PreviewBanner preview={preview} />}
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="font-heading text-site text-2xl tracking-tight">
            {monogramOf(site)}
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
            {anchors.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="text-text-muted hover:text-text text-sm font-medium transition-colors"
              >
                {a.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main id="top" className={cn('pt-20', preview && 'pt-[116px]')}>
        <Theme site={site} siteUrl={site.url} anchors={anchors} />
      </main>
      <footer className="bg-background-alt py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-6 text-center">
          <p className="font-heading text-site text-2xl">
            {coupleOf(site)} · {formatFullDate(site.weddingDate)}
            {site.city && ` · ${site.city}`}
          </p>
          <p className="text-text-muted mt-1 text-[11px] tracking-wide">Made with {APP_NAME}</p>
        </div>
      </footer>
    </div>
  );
}

function PreviewBanner({ preview }: { preview: SitePreview }) {
  return (
    <div className="bg-pending-bg text-pending-text flex h-9 items-center justify-between gap-2 px-4 sm:px-6">
      <p className="truncate text-xs font-medium">
        {preview.published
          ? 'Preview: your latest changes, as guests see them'
          : 'Preview: only your team can see this until you publish'}
      </p>
      <Link
        href={preview.editorHref}
        className="text-site shrink-0 rounded-full bg-white/80 px-3 py-1 text-xs font-medium shadow-sm hover:bg-white"
      >
        ← Back to editor
      </Link>
    </div>
  );
}

interface ThemeProps {
  site: PublicSite;
  siteUrl: string;
  anchors: Anchor[];
}

/* -------------------------------------------------------------------------------------------- */
/* Shared bits                                                                                   */
/* -------------------------------------------------------------------------------------------- */

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn('text-gold-deep text-[11px] font-medium tracking-[0.2em] uppercase', className)}
    >
      {children}
    </span>
  );
}

function StoryParagraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={cn('whitespace-pre-line', className)}>
            {p}
          </p>
        ))}
    </>
  );
}

function Directions({
  event,
  className,
  children,
}: {
  event: PublicSiteEvent;
  className: string;
  children: React.ReactNode;
}) {
  const url = directionsUrl(event);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function CoverImage({ url, className }: { url: string | null; className?: string }) {
  if (!url) return <div className={cn('bg-site-deep absolute inset-0', className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed link
    <img src={url} alt="" className={cn('absolute inset-0 size-full object-cover', className)} />
  );
}

function GalleryCard({ site, theme }: { site: PublicSite; theme: PublicSite['theme'] }) {
  if (!site.galleryUrl) return null;
  if (theme === 'modern') {
    return (
      <section id="gallery" className="scroll-mt-36 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="bg-site flex flex-col items-center justify-between gap-6 rounded-2xl p-8 text-white shadow-xl md:flex-row md:p-12">
            <div className="max-w-xl">
              <span className="text-gold text-[11px] font-medium tracking-[0.2em] uppercase">
                Collaborative guest album
              </span>
              <h2 className="mt-1 text-[32px] tracking-tight uppercase">
                Share your photos with us
              </h2>
              <p className="mt-2 text-white/80">
                Upload photos from your phone straight to our shared album. No app needed.
              </p>
            </div>
            <a
              href={site.galleryUrl}
              className="text-site inline-flex items-center gap-1.5 rounded-full bg-white px-8 py-3 text-sm font-medium shadow-lg hover:bg-white/90"
            >
              Open the photo gallery <ArrowRight aria-hidden className="size-4" />
            </a>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section id="gallery" className="mx-auto max-w-3xl scroll-mt-36 px-4 py-12 sm:px-6 md:py-24">
      <div className="bg-surface flex flex-col items-center rounded-2xl p-8 text-center shadow-sm md:p-12">
        <span className="bg-background-alt text-site mb-4 flex size-16 items-center justify-center rounded-full">
          <Camera aria-hidden className="size-8" />
        </span>
        <h2 className="text-site text-[28px]">Share your photos with us</h2>
        <div className="bg-gold mt-2 mb-4 h-px w-12" />
        <p className="text-text-muted mb-8 max-w-lg">
          Help us capture memories from every celebration. Upload photos from your phone straight to
          our shared family gallery. No app needed.
        </p>
        <a
          href={site.galleryUrl}
          className="bg-site hover:bg-site-deep inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-medium text-white shadow-sm transition-colors"
        >
          <Images aria-hidden className="size-5" />
          Open the photo gallery
        </a>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Classic: centred serif headings, thin gold rules, events as a vertical timeline               */
/* -------------------------------------------------------------------------------------------- */

function ClassicHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-12 flex flex-col items-center text-center">
      <Eyebrow className="mb-1">{eyebrow}</Eyebrow>
      <h2 className="text-site text-[32px] leading-10">{title}</h2>
      <div className="bg-gold mt-2 h-[1.5px] w-16" />
    </div>
  );
}

function ClassicSite({ site, siteUrl, anchors }: ThemeProps) {
  const labels = site.events ? dayLabels(site.events) : new Map<string, string>();
  return (
    <div className="flex flex-col">
      {site.hero && (
        <section className="relative -mt-20 flex h-[100svh] max-h-[921px] min-h-[640px] items-center justify-center overflow-hidden">
          <CoverImage url={site.hero.coverUrl} />
          <div className="from-site-deep/90 via-site-deep/45 to-site-deep/30 absolute inset-0 bg-gradient-to-t mix-blend-multiply" />
          <div className="bg-site-deep/20 absolute inset-0" />
          <div className="relative z-10 flex max-w-4xl flex-col items-center px-6 pt-20 text-center text-white">
            <DaysToGo
              date={site.weddingDate}
              timeZone={site.timezone}
              className="mb-4 bg-white/15 backdrop-blur-md"
              dotClassName="bg-gold animate-ping"
            />
            <h1 className="text-5xl font-normal tracking-tight md:text-[68px] md:leading-[76px]">
              {coupleOf(site)}
            </h1>
            <div className="mt-2 mb-6 flex items-center gap-4">
              <div className="bg-gold/60 h-px w-8" />
              <p className="font-heading text-2xl tracking-wide text-white/85 italic">
                {formatFullDate(site.weddingDate)}
                {site.city && ` · ${site.city}`}
              </p>
              <div className="bg-gold/60 h-px w-8" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {site.events && site.events.length > 0 && (
                <a
                  href="#events"
                  className="text-site rounded-full bg-white px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-white/90"
                >
                  Celebration Schedule
                </a>
              )}
              {site.liveStream && (
                <a
                  href="#live"
                  className="flex items-center gap-1.5 rounded-full bg-white/20 px-6 py-3 text-sm font-medium backdrop-blur-md transition-colors hover:bg-white/30"
                >
                  <Video aria-hidden className="size-[18px]" />
                  Watch Live Stream
                </a>
              )}
            </div>
          </div>
          {anchors.length > 0 && (
            <a
              href={`#${anchors[0]!.id}`}
              className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-white/70 hover:text-white"
            >
              <span className="text-[11px] tracking-widest uppercase">Scroll</span>
              <ArrowDown aria-hidden className="size-5 animate-bounce" />
            </a>
          )}
        </section>
      )}

      {anchors.length > 0 && (
        <nav
          aria-label="On this page"
          className="bg-surface/95 sticky top-20 z-40 w-full shadow-sm backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-5xl items-center justify-start gap-4 overflow-x-auto px-6 py-2 text-nowrap sm:justify-center md:gap-12">
            {anchors.map((a, i) => (
              <span key={a.id} className="flex items-center gap-4 md:gap-12">
                {i > 0 && <span className="text-border text-[10px]">•</span>}
                <a
                  href={`#${a.id}`}
                  className="text-text-muted hover:text-site py-1 text-xs font-medium transition-colors"
                >
                  {a.label}
                </a>
              </span>
            ))}
          </div>
        </nav>
      )}

      {site.story && (
        <section
          id="story"
          className="mx-auto flex w-full max-w-4xl scroll-mt-36 flex-col items-center px-6 py-12 md:py-24"
        >
          <ClassicHeading eyebrow="Chapter One" title="Our Story" />
          <div className="text-text-muted -mt-4 max-w-2xl space-y-4 text-center text-base leading-relaxed">
            <StoryParagraphs text={site.story} />
          </div>
          <div className="bg-background-alt mt-12 flex items-center justify-center rounded-full p-2">
            <span className="bg-surface font-heading text-site flex size-12 items-center justify-center rounded-full text-lg shadow-sm">
              {monogramOf(site).replace(/ /g, '')}
            </span>
          </div>
        </section>
      )}

      {site.events && site.events.length > 0 && (
        <section id="events" className="bg-background-alt scroll-mt-36 py-12 md:py-24">
          <div className="mx-auto max-w-5xl px-6">
            <ClassicHeading eyebrow="Join us" title="Celebration Schedule" />
            <div className="relative mx-auto max-w-3xl">
              <div className="bg-border absolute top-4 bottom-4 left-4 w-px -translate-x-1/2 md:left-1/2" />
              {site.events.map((event, i) => {
                const left = i % 2 === 0;
                const { venue, address } = venueLines(event);
                return (
                  <div
                    key={`${i}-${event.date}-${event.name}`}
                    className={cn(
                      'relative mb-12 flex flex-col items-start gap-6 pl-10 last:mb-0 md:items-center md:pl-0',
                      left ? 'md:flex-row' : 'md:flex-row-reverse',
                    )}
                  >
                    {event.highlight ? (
                      <span className="bg-site ring-background-alt absolute left-4 flex size-6 -translate-x-1/2 items-center justify-center rounded-full shadow-md ring-4 md:left-1/2">
                        <span className="bg-gold size-2.5 rounded-full" />
                      </span>
                    ) : (
                      <span className="bg-surface absolute left-4 flex size-4 -translate-x-1/2 items-center justify-center rounded-full shadow-sm md:left-1/2">
                        <span className="bg-gold-deep size-2 rounded-full" />
                      </span>
                    )}
                    <div
                      className={cn(
                        'w-full md:w-1/2',
                        left ? 'md:pr-6 md:text-right' : 'md:pl-6 md:text-left',
                      )}
                    >
                      {event.highlight ? (
                        <span className="bg-site mb-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] tracking-wider text-white uppercase">
                          Main ceremony
                        </span>
                      ) : (
                        <span className="text-gold-deep text-xs font-medium tracking-wider uppercase">
                          {labels.get(event.date)} · {formatFullDate(event.date)}
                        </span>
                      )}
                      <h3
                        className={cn(
                          'text-site mt-1 text-[28px] leading-9',
                          event.highlight && 'font-semibold',
                        )}
                      >
                        {event.name}
                      </h3>
                      <p className="text-text-muted mt-1 text-sm">
                        {event.highlight && `${formatFullDate(event.date)} · `}
                        {timeRange(event)}
                      </p>
                    </div>
                    <div className={cn('w-full md:w-1/2', left ? 'md:pl-6' : 'md:pr-6')}>
                      <div
                        className={cn(
                          'bg-surface rounded-xl p-6',
                          event.highlight ? 'shadow-md' : 'shadow-sm',
                        )}
                      >
                        {venue && (
                          <div className="mb-2 flex items-start gap-2">
                            {event.highlight ? (
                              <Gem aria-hidden className="text-gold-deep mt-0.5 size-5 shrink-0" />
                            ) : (
                              <MapPin
                                aria-hidden
                                className="text-gold-deep mt-0.5 size-5 shrink-0"
                              />
                            )}
                            <div>
                              <p className={cn('font-medium', event.highlight && 'text-site')}>
                                {venue}
                              </p>
                              {address && <p className="text-text-muted text-sm">{address}</p>}
                            </div>
                          </div>
                        )}
                        {event.dressCode && (
                          <div className="bg-background-alt/60 mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5">
                            <Shirt aria-hidden className="text-text-muted size-4" />
                            <span className="text-text-muted text-[11px]">
                              Dress code: {event.dressCode}
                            </span>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <Directions
                            event={event}
                            className="text-site inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
                          >
                            View directions <ArrowRight aria-hidden className="size-4" />
                          </Directions>
                          {event.highlight && site.liveStream && (
                            <span className="text-gold-deep text-[11px] font-medium">
                              Live stream available
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {site.photoUrls && (
        <section id="photos" className="mx-auto w-full max-w-7xl scroll-mt-36 px-6 py-12 md:py-24">
          <ClassicHeading eyebrow="Captured Moments" title="Our Photos" />
          <PhotoGallery urls={site.photoUrls} theme="classic" />
        </section>
      )}

      {site.liveStream && (
        <section id="live" className="bg-background-alt scroll-mt-36 py-12 md:py-24">
          <div className="mx-auto flex max-w-4xl flex-col px-6">
            <ClassicHeading eyebrow="For loved ones far away" title="Watch Live" />
            <p className="text-text-muted -mt-6 mb-8 text-center">
              For family and friends who can&apos;t be with us, the ceremony will be streamed here.
            </p>
            <LiveStream
              theme="classic"
              videoId={site.liveStream.videoId}
              startsAt={site.liveStream.startsAt}
              timeZone={site.timezone}
              couple={coupleOf(site)}
              siteUrl={siteUrl}
            />
          </div>
        </section>
      )}

      <GalleryCard site={site} theme="classic" />
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Elegant: editorial, italic accents, generous whitespace, events as two-column cards           */
/* -------------------------------------------------------------------------------------------- */

function ElegantSite({ site, siteUrl, anchors }: ThemeProps) {
  const events = site.events ?? [];
  const labels = dayLabels(events);
  const days = labels.size;
  return (
    <div className="flex flex-col">
      {anchors.length > 0 && (
        <div className="bg-background/90 sticky top-20 z-40 w-full shadow-sm backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="bg-gold-deep size-2 rounded-full" />
              <span className="text-text-muted text-[11px] tracking-[0.2em] uppercase">
                The Celebration
              </span>
            </div>
            <nav
              aria-label="On this page"
              className="flex items-center gap-4 overflow-x-auto sm:gap-6"
            >
              {anchors.map((a) => (
                <a
                  key={a.id}
                  href={`#${a.id}`}
                  className="text-text-muted hover:text-site text-xs font-medium whitespace-nowrap transition-colors"
                >
                  {a.label}
                </a>
              ))}
            </nav>
            {events.length > 0 ? (
              <a
                href="#events"
                className="text-site hidden items-center gap-1 text-xs font-medium hover:opacity-80 sm:inline-flex"
              >
                Timeline <ArrowDown aria-hidden className="size-4" />
              </a>
            ) : (
              <span className="hidden sm:block" />
            )}
          </div>
        </div>
      )}

      {site.hero && (
        <section className="relative flex h-[100svh] max-h-[920px] min-h-[640px] items-end overflow-hidden">
          <CoverImage url={site.hero.coverUrl} className="scale-105" />
          <div className="from-site-deep via-site-deep/45 absolute inset-0 bg-gradient-to-t to-transparent" />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-12 text-white">
            <DaysToGo
              date={site.weddingDate}
              timeZone={site.timezone}
              className="mb-4 bg-white/20 backdrop-blur-md"
              dotClassName="bg-gold"
            />
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <p className="mb-1 text-sm tracking-[0.2em] text-white/90 uppercase">
                  Together with their families
                </p>
                <h1 className="text-5xl font-normal md:text-[68px] md:leading-[1.1]">
                  {site.brideName} <span className="text-gold italic">&amp;</span> {site.groomName}
                </h1>
                <p className="font-heading mt-1 text-2xl text-white/90">
                  {formatFullDate(site.weddingDate)}
                  {site.city && (
                    <>
                      <span className="text-gold mx-2">·</span>
                      {site.city}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 pb-1">
                {site.liveStream && (
                  <a
                    href="#live"
                    className="text-site inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium shadow-xl transition-colors hover:bg-white/90"
                  >
                    <Radio aria-hidden className="size-[18px]" />
                    Join Live Broadcast
                  </a>
                )}
                {events.length > 0 && (
                  <a
                    href="#events"
                    aria-label="See the celebrations"
                    className="inline-flex size-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-md transition-colors hover:bg-white/30"
                  >
                    <CalendarDays aria-hidden className="size-5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {site.story && (
        <section id="story" className="mx-auto w-full max-w-6xl scroll-mt-36 px-6 py-12 lg:py-24">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
            <div className="flex flex-col pt-2 lg:col-span-5">
              <span className="text-site text-[11px] font-medium tracking-[0.2em] uppercase">
                Chapter One
              </span>
              <h2 className="text-site mt-1 mb-4 text-[32px] leading-10">Our Story</h2>
              <div className="bg-gold mb-4 h-0.5 w-16" />
              {events.length > 0 && (
                <div className="flex items-center gap-6 pt-2">
                  <div>
                    <p className="font-heading text-site text-2xl">{events.length}</p>
                    <p className="text-text-muted text-[11px] tracking-wider uppercase">
                      {events.length === 1 ? 'Celebration' : 'Celebrations'}
                    </p>
                  </div>
                  <div className="bg-border h-8 w-px" />
                  <div>
                    <p className="font-heading text-site text-2xl">{days}</p>
                    <p className="text-text-muted text-[11px] tracking-wider uppercase">
                      {days === 1 ? 'Day' : 'Days'}
                      {site.city && ` in ${site.city}`}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="text-text-muted [&>p:first-child]:text-text flex flex-col gap-4 text-base leading-relaxed lg:col-span-7">
              <StoryParagraphs text={site.story} />
            </div>
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section id="events" className="bg-background-alt scroll-mt-36 py-12 md:py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <span className="text-site text-[11px] font-medium tracking-[0.2em] uppercase">
                Itinerary
              </span>
              <h2 className="text-site mt-1 text-5xl font-normal">The Celebrations</h2>
              <p className="text-text-muted mt-1">
                Please join us as we mark each milestone together.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {events.map((event, i) => {
                const wide = events.length % 2 === 1 && i === events.length - 1 && i > 0;
                const { venue, address } = venueLines(event);
                const place = [venue, address].filter(Boolean).join(', ');
                return (
                  <div
                    key={`${i}-${event.date}-${event.name}`}
                    className={cn(
                      'bg-surface flex flex-col justify-between rounded-2xl p-6 shadow-sm transition-shadow hover:shadow-md',
                      event.highlight && 'border-l-site border-l-4',
                      wide && 'md:col-span-2',
                    )}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]',
                            event.highlight
                              ? 'bg-site font-medium text-white'
                              : 'bg-background-alt text-site',
                          )}
                        >
                          <span
                            className={cn(
                              'size-1.5 rounded-full',
                              event.highlight ? 'bg-gold' : 'bg-gold-deep',
                            )}
                          />
                          {labels.get(event.date)} · {partOfDay(event.startTime)}
                        </span>
                        <span
                          className={cn(
                            'text-[11px]',
                            event.highlight ? 'text-site font-semibold' : 'text-text-muted',
                          )}
                        >
                          {formatFullDate(event.date)}
                        </span>
                      </div>
                      <h3 className="text-site text-[28px] leading-9">{event.name}</h3>
                      <p className="text-text-muted mt-1 text-sm">{timeRange(event)}</p>
                      {(place || event.dressCode) && (
                        <div className="border-background-alt mt-4 space-y-2 border-t pt-4">
                          {place && (
                            <div className="flex items-start gap-2">
                              <MapPin
                                aria-hidden
                                className="text-site mt-0.5 size-[18px] shrink-0"
                              />
                              <span className={cn(event.highlight && 'font-medium')}>{place}</span>
                            </div>
                          )}
                          {event.dressCode && (
                            <div className="flex items-center gap-2">
                              <Shirt aria-hidden className="text-gold-deep size-[18px] shrink-0" />
                              <span className="text-text-muted text-sm">
                                Dress code:{' '}
                                <strong className="text-text font-medium">{event.dressCode}</strong>
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between pt-2">
                      <Directions
                        event={event}
                        className="text-site inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
                      >
                        View directions <ArrowUpRight aria-hidden className="size-4" />
                      </Directions>
                      {event.highlight && site.liveStream && (
                        <span className="text-gold-deep text-[11px] font-medium">
                          Streamed live
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {site.photoUrls && (
        <section id="photos" className="mx-auto w-full max-w-6xl scroll-mt-36 px-6 py-12 md:py-24">
          <div className="mb-6 flex flex-col justify-between gap-2 md:flex-row md:items-end">
            <div>
              <span className="text-site text-[11px] font-medium tracking-[0.2em] uppercase">
                Editorial
              </span>
              <h2 className="text-site mt-1 text-5xl font-normal">Captured Moments</h2>
            </div>
            <p className="text-text-muted max-w-sm">A few of our favourite moments together.</p>
          </div>
          <PhotoGallery urls={site.photoUrls} theme="elegant" />
        </section>
      )}

      {site.liveStream && (
        <section id="live" className="bg-background-alt scroll-mt-36 py-12 md:py-24">
          <div className="mx-auto max-w-4xl px-6">
            <div className="mb-6 text-center">
              <span className="bg-background text-site mb-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] shadow-sm">
                <span className="bg-live size-2 animate-ping rounded-full" />
                Live broadcast
              </span>
              <h2 className="text-site text-5xl font-normal">Watch Live</h2>
              <p className="text-text-muted mx-auto mt-1 max-w-md">
                For family and dear friends celebrating with us from across the world.
              </p>
            </div>
            <LiveStream
              theme="elegant"
              videoId={site.liveStream.videoId}
              startsAt={site.liveStream.startsAt}
              timeZone={site.timezone}
              couple={coupleOf(site)}
              siteUrl={siteUrl}
            />
          </div>
        </section>
      )}

      <GalleryCard site={site} theme="elegant" />

      <section className="mx-auto w-full max-w-3xl px-6 pt-6 pb-12 text-center">
        <div className="mb-4 flex items-center justify-center gap-4">
          <div className="bg-border h-px w-16" />
          <span className="font-heading text-gold-deep text-2xl italic">{monogramOf(site)}</span>
          <div className="bg-border h-px w-16" />
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* Modern: bold uppercase headings, left-aligned, horizontal event cards, blocks of accent      */
/* -------------------------------------------------------------------------------------------- */

function ModernHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="bg-site mb-2 h-1 w-12 rounded-full" />
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-site mt-1 text-[32px] leading-10 font-medium tracking-tight uppercase">
        {title}
      </h2>
    </div>
  );
}

function ModernSite({ site, siteUrl, anchors }: ThemeProps) {
  const events = site.events ?? [];
  const labels = dayLabels(events);
  const shortDate = (date: string) => formatFullDate(date).toUpperCase();
  return (
    <div className="flex flex-col">
      {site.hero && (
        <section className="relative -mt-20 flex h-[92svh] min-h-[600px] items-end overflow-hidden">
          <CoverImage url={site.hero.coverUrl} />
          <div className="from-site-deep/95 via-site-deep/45 absolute inset-0 bg-gradient-to-t to-transparent" />
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-28 pb-12">
            <div className="flex max-w-3xl flex-col items-start gap-2">
              <DaysToGo
                date={site.weddingDate}
                timeZone={site.timezone}
                className="bg-site text-white shadow-md"
                dotClassName="bg-gold animate-pulse"
              />
              <h1 className="mt-1 text-[44px] leading-none font-semibold tracking-tight text-white uppercase md:text-[57px]">
                {coupleOf(site)}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-4 font-medium tracking-wider text-white/85 uppercase">
                <span>{formatFullDate(site.weddingDate)}</span>
                {site.city && (
                  <>
                    <span className="text-gold">/</span>
                    <span>{site.city}</span>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {events.length > 0 && (
                  <a
                    href="#events"
                    className="text-site rounded-full bg-white px-6 py-2.5 text-sm font-medium shadow-lg transition-colors hover:bg-white/90"
                  >
                    Explore Schedule
                  </a>
                )}
                {site.liveStream && (
                  <a
                    href="#live"
                    className="bg-site/80 hover:bg-site inline-flex items-center gap-1.5 rounded-full px-6 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors"
                  >
                    <PlayCircle aria-hidden className="size-[18px]" />
                    Live Broadcast
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {anchors.length > 0 && (
        <section className="bg-surface sticky top-20 z-40 w-full shadow-sm">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between overflow-x-auto px-6">
            <nav aria-label="On this page" className="flex items-center gap-6 whitespace-nowrap">
              {anchors.map((a) => (
                <a
                  key={a.id}
                  href={`#${a.id}`}
                  className="text-text-muted hover:text-site text-xs font-medium tracking-widest uppercase transition-colors"
                >
                  {a.label}
                </a>
              ))}
            </nav>
            {site.city && (
              <div className="text-text-muted hidden items-center gap-2 text-[11px] md:flex">
                <MapPin aria-hidden className="text-gold-deep size-4" />
                <span>{site.city}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {site.story && (
        <section id="story" className="scroll-mt-36 py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-12 px-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <ModernHeading eyebrow="Chapter 01" title="Our Story" />
            </div>
            <div className="bg-surface rounded-xl p-6 shadow-sm lg:col-span-8">
              <div className="text-text-muted space-y-4 leading-relaxed">
                <StoryParagraphs text={site.story} />
              </div>
            </div>
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section id="events" className="bg-background-alt scroll-mt-36 py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-6">
              <ModernHeading eyebrow="Timeline" title="Schedule & Celebrations" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event, i) => {
                const { venue, address } = venueLines(event);
                const place = [venue, address].filter(Boolean).join(', ');
                const main = event.highlight;
                return (
                  <div
                    key={`${i}-${event.date}-${event.name}`}
                    className={cn(
                      'flex flex-col justify-between rounded-xl p-6 transition-shadow',
                      main
                        ? 'bg-site-deep text-white shadow-md hover:shadow-lg'
                        : 'bg-surface shadow-sm hover:shadow-md',
                    )}
                  >
                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <span
                          className={cn(
                            'rounded px-2 py-1 text-[11px] font-semibold uppercase',
                            main ? 'bg-site text-white' : 'bg-background-alt text-site',
                          )}
                        >
                          {main ? 'Main event' : labels.get(event.date)}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-[11px]',
                            main ? 'text-white/70' : 'text-text-muted',
                          )}
                        >
                          {shortDate(event.date)}
                        </span>
                      </div>
                      <h3
                        className={cn('text-2xl font-semibold', main ? 'text-white' : 'text-text')}
                      >
                        {event.name}
                      </h3>
                      <p className={cn('mt-1 font-medium', main ? 'text-gold' : 'text-gold-deep')}>
                        {timeRange(event)}
                      </p>
                      <div className="mt-4 space-y-2 text-sm">
                        {place && (
                          <div
                            className={cn(
                              'flex items-start gap-1.5',
                              main ? 'text-white/80' : 'text-text-muted',
                            )}
                          >
                            <MapPin
                              aria-hidden
                              className={cn('size-[18px] shrink-0', main && 'text-gold')}
                            />
                            <span>{place}</span>
                          </div>
                        )}
                        {event.dressCode && (
                          <div
                            className={cn(
                              'flex items-start gap-1.5',
                              main ? 'text-white/80' : 'text-text-muted',
                            )}
                          >
                            <Shirt
                              aria-hidden
                              className={cn('size-[18px] shrink-0', main && 'text-gold')}
                            />
                            <span>Dress code: {event.dressCode}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-6 pt-2">
                      <Directions
                        event={event}
                        className={cn(
                          'inline-flex w-full items-center justify-center gap-1 rounded-full py-2 text-xs font-medium transition-colors',
                          main
                            ? 'text-site bg-white hover:bg-white/90'
                            : 'bg-background-alt text-site hover:bg-border',
                        )}
                      >
                        Directions <ArrowRight aria-hidden className="size-4" />
                      </Directions>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {site.photoUrls && (
        <section id="photos" className="scroll-mt-36 py-12">
          <div className="mx-auto mb-6 max-w-7xl px-6">
            <ModernHeading eyebrow="Imagery" title="Framed Moments" />
          </div>
          <div className="mx-auto max-w-7xl px-6">
            <PhotoGallery urls={site.photoUrls} theme="modern" />
          </div>
        </section>
      )}

      {site.liveStream && (
        <section id="live" className="bg-background-alt scroll-mt-36 py-12">
          <div className="mx-auto max-w-5xl px-6">
            <div className="mb-6 flex flex-col items-center text-center">
              <span className="bg-surface text-site mb-2 inline-flex items-center gap-2 rounded-full px-4 py-1 text-[11px] font-semibold tracking-wider uppercase shadow-sm">
                <span className="bg-live size-2 animate-ping rounded-full" />
                Direct live feed
              </span>
              <h2 className="text-site text-[32px] font-medium tracking-tight uppercase">
                Watch Live Stream
              </h2>
              <p className="text-text-muted mt-1 max-w-lg">
                For family and guests joining us from far away.
              </p>
            </div>
            <LiveStream
              theme="modern"
              videoId={site.liveStream.videoId}
              startsAt={site.liveStream.startsAt}
              timeZone={site.timezone}
              couple={coupleOf(site)}
              siteUrl={siteUrl}
            />
          </div>
        </section>
      )}

      <GalleryCard site={site} theme="modern" />
    </div>
  );
}
