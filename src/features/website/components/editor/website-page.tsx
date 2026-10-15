'use client';

import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  Pencil,
  Send,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/features/events/hooks';
import { useWedding } from '@/features/weddings/hooks';
import type { UpdateWebsiteInput, WebsiteSettings } from '@/modules/website/website.types';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { previewUrl } from '../../api';
import {
  useChangeSlug,
  useSetPublished,
  useSlugCheck,
  useUpdateWebsite,
  useWebsite,
} from '../../hooks';
import { LivePreview } from './live-preview';
import {
  card,
  COVER_INPUT_ID,
  CoverCard,
  EventsCard,
  GalleryCard,
  LiveStreamCard,
  LookCard,
  PhotosCard,
  SearchCard,
  StoryCard,
  type CardProps,
} from './section-cards';
import { WeddingLoader } from '@/components/common/wedding-loader';

// The Website page (Stitch "Website"; PRD §5.9): edit the couple's public site, with a live
// preview beside it. Every change saves straight away. Publishing and the address are for
// Admins.

type SaveStatus = { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string };

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === 'CONFLICT') {
    return 'Someone else changed this a moment ago. Their change is now shown; please try again.';
  }
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

/** The address without the protocol, e.g. "makemymarriage.in/w/nafiya-irfan-14-apr-2028". */
const bareUrl = (url: string) => url.replace(/^https?:\/\//, '');

export function WebsitePage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: settings, error, isPending, refetch } = useWebsite(weddingId);
  const { data: events } = useEvents(weddingId);
  const update = useUpdateWebsite(weddingId);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'saved' });
  const [version, setVersion] = useState(0);
  const [skipIntro, setSkipIntro] = useState(false);

  if (isPending || !wedding) {
    return <WeddingLoader label="Loading your website" size="page" />;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your website</h1>
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

  const readOnly = wedding.status === 'archived';
  const isAdmin = wedding.me.role === 'admin';
  const refreshPreview = () => setVersion((v) => v + 1);

  async function save(input: UpdateWebsiteInput): Promise<boolean> {
    setStatus({ kind: 'saving' });
    try {
      await update.mutateAsync(input);
      setStatus({ kind: 'saved' });
      refreshPreview();
      return true;
    } catch (e) {
      setStatus({ kind: 'error', message: messageOf(e) });
      return false;
    }
  }

  const props: CardProps = { weddingId, wedding, settings, save, readOnly, isAdmin };
  // A brand-new site: nothing added yet (Stitch "Empty first-visit state").
  const fresh =
    !skipIntro &&
    !readOnly &&
    !settings.published &&
    !settings.cover &&
    !settings.story &&
    settings.photos.length === 0;

  return (
    <div className="pb-16">
      <PageHeader
        weddingId={weddingId}
        settings={settings}
        status={status}
        isAdmin={isAdmin}
        readOnly={readOnly}
        onPublished={refreshPreview}
      />

      {readOnly && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input mb-5 px-4 py-3 text-sm"
        >
          This wedding is archived, so its website can&apos;t be changed. It stays online if it was
          published.
        </p>
      )}

      {fresh && <FirstVisit wedding={wedding} onSkip={() => setSkipIntro(true)} />}

      <div className={cn('grid grid-cols-1 items-start gap-6 lg:grid-cols-12', fresh && 'hidden')}>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <AddressCard
            weddingId={weddingId}
            settings={settings}
            isAdmin={isAdmin}
            readOnly={readOnly}
          />
          <LookCard {...props} />
          <CoverCard {...props} />
          <StoryCard {...props} />
          <EventsCard {...props} events={events ?? []} onChanged={refreshPreview} />
          <PhotosCard {...props} />
          <LiveStreamCard {...props} />
          <GalleryCard {...props} />
          <SearchCard {...props} />
        </div>
        <div className="sticky top-20 hidden lg:col-span-5 lg:block">
          <LivePreview slug={settings.slug} displayUrl={bareUrl(settings.url)} version={version} />
        </div>
      </div>
    </div>
  );
}

function PageHeader({
  weddingId,
  settings,
  status,
  isAdmin,
  readOnly,
  onPublished,
}: {
  weddingId: string;
  settings: WebsiteSettings;
  status: SaveStatus;
  isAdmin: boolean;
  readOnly: boolean;
  onPublished: () => void;
}) {
  const publish = useSetPublished(weddingId);
  const [problem, setProblem] = useState<string | null>(null);

  function setPublished(published: boolean) {
    setProblem(null);
    publish.mutate(published, {
      onSuccess: onPublished,
      onError: (e) => setProblem(messageOf(e)),
    });
  }

  return (
    <header className="border-border/70 mb-6 flex flex-col gap-4 border-b pb-6 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-normal tracking-tight md:text-5xl">Website</h1>
          <SaveChip status={status} />
        </div>
        <p className="text-text-muted">
          Share your story, celebrations and live stream with family and guests.
        </p>
        {status.kind === 'error' && (
          <p role="alert" className="text-danger-text text-sm">
            {status.message}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-danger-text text-sm">
            {problem}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
        {settings.published ? (
          <span className="bg-success-bg text-success-text inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium">
            <span className="bg-success-text size-2 rounded-full" />
            Published
          </span>
        ) : (
          <span className="bg-pending-bg text-pending-text inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium">
            <span className="bg-pending-text size-2 rounded-full" />
            Draft
          </span>
        )}
        <a
          href={previewUrl(settings.slug)}
          target="_blank"
          rel="noopener"
          className="bg-background-alt hover:bg-border inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors"
        >
          <Eye aria-hidden className="text-text-muted size-4" />
          Preview
          <ExternalLink aria-hidden className="text-text-muted size-3.5" />
        </a>
        {isAdmin &&
          !readOnly &&
          (settings.published ? (
            <button
              type="button"
              onClick={() => setPublished(false)}
              disabled={publish.isPending}
              className="text-text-muted hover:text-text h-10 rounded-full px-3 text-sm font-medium"
            >
              {publish.isPending ? 'Unpublishing…' : 'Unpublish'}
            </button>
          ) : (
            <Button
              className="h-10 gap-2 px-5"
              onClick={() => setPublished(true)}
              disabled={publish.isPending}
            >
              <Send aria-hidden className="size-4" />
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          ))}
      </div>
    </header>
  );
}

function SaveChip({ status }: { status: SaveStatus }) {
  if (status.kind === 'saving') {
    return (
      <span className="bg-background-alt text-text-muted inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status.kind === 'error') {
    return (
      <span className="bg-danger-bg text-danger-text inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
        <CircleAlert aria-hidden className="size-3.5" />
        Not saved
      </span>
    );
  }
  return (
    <span className="bg-background-alt text-success-text inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium">
      <CircleCheck aria-hidden className="size-3.5" />
      All changes saved
    </span>
  );
}

function FirstVisit({ wedding, onSkip }: { wedding: Wedding; onSkip: () => void }) {
  const steps = [
    ['Cover & theme', 'Upload a favourite photo and choose a style and colour.'],
    ['Your events', 'Pick which celebrations appear, with places and times.'],
    ['Share with family', 'Publish, then send your link or share it on WhatsApp.'],
  ] as const;
  return (
    <section className={cn(card, 'my-6 flex flex-col items-center p-8 text-center sm:p-12')}>
      <span className="bg-primary-tint text-primary mb-4 flex size-16 items-center justify-center rounded-full">
        <Globe aria-hidden className="size-7" />
      </span>
      <span className="text-gold-deep text-[11px] font-semibold tracking-widest uppercase">
        Getting started
      </span>
      <h2 className="text-primary mt-1 mb-2 text-3xl">Your wedding website is ready to set up</h2>
      <p className="text-text-muted mb-8 max-w-lg">
        Make a home online for {wedding.brideName} &amp; {wedding.groomName}&apos;s celebrations in
        a few minutes.
      </p>
      <div className="mb-10 grid w-full max-w-2xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
        {steps.map(([title, text], i) => (
          <div key={title} className="bg-background rounded-xl p-4">
            <span className="font-heading text-gold-deep mb-1 block text-2xl">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mb-1 font-sans text-base font-medium">{title}</h3>
            <p className="text-text-muted text-sm">{text}</p>
          </div>
        ))}
      </div>
      <label
        htmlFor={COVER_INPUT_ID}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-12 cursor-pointer items-center gap-2 rounded-full px-8 text-base font-medium shadow-sm transition-colors"
      >
        Start with a cover photo
      </label>
      <button
        type="button"
        onClick={onSkip}
        className="text-text-muted hover:text-primary mt-4 text-sm font-medium"
      >
        Set up the rest first
      </button>
    </section>
  );
}

function AddressCard({
  weddingId,
  settings,
  isAdmin,
  readOnly,
}: {
  weddingId: string;
  settings: WebsiteSettings;
  isAdmin: boolean;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareText = `Our wedding website: ${settings.url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(settings.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is selectable as text.
    }
  }

  return (
    <section className={card}>
      <div className="mb-2 flex items-center justify-between pb-2">
        <span className="text-gold-deep text-[11px] font-semibold tracking-wider uppercase">
          Website address
        </span>
        <span className="text-text-muted inline-flex items-center gap-1 text-[11px]">
          <Lock aria-hidden className="size-3" />
          Admins change it
        </span>
      </div>
      {editing ? (
        <SlugEditor weddingId={weddingId} settings={settings} onDone={() => setEditing(false)} />
      ) : (
        <div className="bg-background flex flex-col justify-between gap-2 rounded-xl p-4 2xl:flex-row 2xl:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <Link2 aria-hidden className="text-gold-deep size-5 shrink-0" />
            <span className="text-primary truncate font-medium select-all">
              {bareUrl(settings.url)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void copy()}
              className="bg-background-alt hover:bg-border inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {copied ? (
                <Check aria-hidden className="text-success-text size-4" />
              ) : (
                <Copy aria-hidden className="text-primary size-4" />
              )}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-success-bg text-success-text inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            >
              <MessageCircle aria-hidden className="size-4" />
              WhatsApp
            </a>
            {isAdmin && !readOnly && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Change the address"
                title="Change the address"
                className="text-text-muted hover:text-primary hover:bg-background-alt rounded-full p-1.5 transition-colors"
              >
                <Pencil aria-hidden className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}
      <p className="text-text-muted mt-2 text-sm">
        {settings.published
          ? 'Anyone with this link can see your published website.'
          : 'Guests can open this link once you publish. Until then only your team sees it, in Preview.'}
      </p>
    </section>
  );
}

function SlugEditor({
  weddingId,
  settings,
  onDone,
}: {
  weddingId: string;
  settings: WebsiteSettings;
  onDone: () => void;
}) {
  const [value, setValue] = useState(settings.slug);
  const [checked, setChecked] = useState(settings.slug);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>();
  const change = useChangeSlug(weddingId);
  const changed = checked !== settings.slug;
  const { data: check, isFetching } = useSlugCheck(weddingId, checked, changed);
  const prefix = bareUrl(settings.url).slice(0, -settings.slug.length);

  function onChange(next: string) {
    const cleaned = next.toLowerCase().replace(/\s+/g, '-');
    setValue(cleaned);
    clearTimeout(timer);
    setTimer(setTimeout(() => setChecked(cleaned.trim()), 400));
  }

  const ready = changed && check?.slug === checked && check.available && !isFetching;
  const badge = !changed
    ? null
    : isFetching || check?.slug !== checked
      ? { tone: 'muted', text: 'Checking…' }
      : check.available
        ? { tone: 'ok', text: 'Available' }
        : check.reason === 'reserved'
          ? { tone: 'bad', text: 'Reserved' }
          : check.reason === 'invalid'
            ? { tone: 'bad', text: 'Not allowed' }
            : { tone: 'bad', text: 'Taken' };

  return (
    <form
      className="bg-background-alt flex flex-col gap-2 rounded-xl p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        change.mutate(checked, { onSuccess: onDone });
      }}
    >
      <label htmlFor="website-slug" className="text-sm font-medium">
        Website address
      </label>
      <div className="bg-surface rounded-input flex items-center px-4 py-2 shadow-sm">
        <span className="text-text-muted hidden text-sm select-none sm:inline">{prefix}</span>
        <input
          id="website-slug"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={60}
          autoFocus
          className="text-primary min-w-0 flex-1 bg-transparent px-1 font-medium outline-none"
        />
        {badge && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              badge.tone === 'ok' && 'bg-success-bg text-success-text',
              badge.tone === 'bad' && 'bg-danger-bg text-danger-text',
              badge.tone === 'muted' && 'bg-background text-text-muted',
            )}
          >
            {badge.tone === 'ok' && <Check aria-hidden className="size-3" />}
            {badge.text}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <span className="text-text-muted">
          {check && changed && check.slug === checked && check.reason === 'invalid' ? (
            '3–60 lowercase letters, numbers and single hyphens.'
          ) : check?.suggestion && changed && check.slug === checked ? (
            <>
              Try{' '}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  setValue(check.suggestion!);
                  setChecked(check.suggestion!);
                }}
              >
                {check.suggestion}
              </button>
            </>
          ) : (
            'Links you already shared stop working when the address changes.'
          )}
        </span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDone}
            className="text-text-muted hover:text-text font-medium"
          >
            Cancel
          </button>
          <Button
            type="submit"
            size="sm"
            className="rounded-full px-4"
            disabled={!ready || change.isPending}
          >
            {change.isPending ? 'Saving…' : 'Save'}
          </Button>
        </span>
      </div>
      {change.error && (
        <p role="alert" className="text-danger-text text-sm">
          {messageOf(change.error)}
        </p>
      )}
    </form>
  );
}
