'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BadgeCheck,
  Check,
  CircleCheck,
  Clock,
  GripVertical,
  ImagePlus,
  Info,
  PlayCircle,
  Plus,
  Trash2,
  Upload,
  X,
  MonitorPlay,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { SoonTag } from '@/components/common/soon-tag';
import { Switch } from '@/components/ui/switch';
import { timezoneLabel } from '@/config/constants';
import { useReorderEvents, useUpdateEvent } from '@/features/events/hooks';
import { uploadFile } from '@/features/files/upload';
import type { WeddingEvent } from '@/modules/events/events.types';
import {
  ACCENT_COLORS,
  MAX_STORY_LENGTH,
  MAX_WEBSITE_PHOTOS,
  THEME_LABELS,
  WEBSITE_THEMES,
  youTubeVideoId,
  type WebsiteSection,
  type WebsiteTheme,
} from '@/modules/website/website.schemas';
import type { UpdateWebsiteInput, WebsiteSettings } from '@/modules/website/website.types';
import type { Wedding } from '@/modules/weddings/weddings.types';
import { cn } from '@/shared/cn';
import { formatDate, formatFullDate, localParts, localTimeToUtc } from '@/shared/dates';
import { ImageProblem, resizeImage } from '../../resize-image';

// The editor's cards (Stitch "Website", left column), one per part of the site.

export const card = 'border-border bg-surface rounded-card shadow-card border p-6';

export interface CardProps {
  weddingId: string;
  wedding: Wedding;
  settings: WebsiteSettings;
  /** Save a change; resolves `false` if it failed (the page shows why). */
  save: (input: UpdateWebsiteInput) => Promise<boolean>;
  readOnly: boolean;
  isAdmin: boolean;
}

function CardHeader({
  title,
  description,
  section,
  settings,
  save,
  readOnly,
  extra,
}: {
  title: string;
  description?: string;
  section?: WebsiteSection;
  settings?: WebsiteSettings;
  save?: CardProps['save'];
  readOnly?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-primary text-2xl">{title}</h2>
          {extra}
        </div>
        {description && <p className="text-text-muted mt-0.5 text-sm">{description}</p>}
      </div>
      {section && settings && save && (
        <Switch
          aria-label={`Show ${title} on the website`}
          checked={settings.sections[section]}
          disabled={readOnly}
          onCheckedChange={(checked) => void save({ sections: { [section]: checked } })}
          className="mt-1"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------ */

const THEME_THUMBS: Record<WebsiteTheme, React.ReactNode> = {
  classic: (
    <div className="bg-background-alt flex h-20 flex-col items-center justify-center rounded-lg p-2">
      <div className="bg-border mb-1 h-1 w-8 rounded-full" />
      <div className="bg-text-muted/30 mb-2 h-2 w-14 rounded" />
      <div className="bg-surface text-text-muted flex h-6 w-full items-center justify-center rounded text-[9px]">
        Classic serif
      </div>
    </div>
  ),
  elegant: (
    <div className="bg-primary relative flex h-20 items-center justify-center rounded-lg p-2">
      <div className="font-heading text-gold flex size-10 items-center justify-center rounded-full bg-white/15 text-xs italic">
        N&amp;I
      </div>
      <div className="absolute right-2 bottom-1 text-[8px] tracking-widest text-white/70">
        ELEGANT
      </div>
    </div>
  ),
  modern: (
    <div className="bg-background-alt flex h-20 flex-col justify-between rounded-lg p-2">
      <div className="bg-primary h-1 w-6 rounded-full" />
      <div className="bg-text-muted/40 h-2 w-16 rounded" />
      <div className="flex gap-1">
        <div className="bg-gold-deep size-4 rounded-full" />
        <div className="bg-surface h-2 w-12 rounded" />
      </div>
    </div>
  ),
};

export function LookCard({ settings, save, readOnly }: CardProps) {
  return (
    <section className={cn(card, 'space-y-5')}>
      <CardHeader title="Look & Feel" description="Choose a style and an accent colour." />
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {WEBSITE_THEMES.map((theme) => {
          const selected = settings.theme === theme;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={readOnly}
              onClick={() => !selected && void save({ theme })}
              className={cn(
                'flex flex-col rounded-xl p-2 text-left transition-colors disabled:cursor-not-allowed',
                selected
                  ? 'bg-primary-tint ring-primary shadow-sm ring-1'
                  : 'bg-background hover:bg-background-alt',
              )}
            >
              <div className="mb-2 w-full overflow-hidden">{THEME_THUMBS[theme]}</div>
              <span className="flex w-full items-center justify-between">
                <span className={cn('font-medium', selected && 'text-primary')}>
                  {THEME_LABELS[theme].label}
                </span>
                {selected && <CircleCheck aria-hidden className="text-primary size-5" />}
              </span>
              <span className="text-text-muted text-xs">{THEME_LABELS[theme].description}</span>
            </button>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Accent colour</p>
        <div
          role="radiogroup"
          aria-label="Accent colour"
          className="flex flex-wrap items-center gap-3"
        >
          {ACCENT_COLORS.map((color) => {
            const selected = settings.accentColor === color.value;
            return (
              <button
                key={color.value}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={color.label}
                title={color.label}
                disabled={readOnly}
                onClick={() => !selected && void save({ accentColor: color.value })}
                // The swatch shows the couple's own colour choice (data, not app styling).
                style={{ backgroundColor: color.value }}
                className={cn(
                  'flex items-center justify-center rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed',
                  selected
                    ? 'ring-offset-surface size-9 shadow-sm ring-2 ring-current ring-offset-2'
                    : 'size-8',
                )}
              >
                {selected && <Check aria-hidden className="size-4 text-white" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

/** Pick image files with a hidden input; returns an opener. */
function useFilePicker(onFiles: (files: File[]) => void, multiple = false, id?: string) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      id={id}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple={multiple}
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (files.length > 0) onFiles(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

async function uploadPhoto(
  weddingId: string,
  purpose: 'website_cover' | 'website_photo',
  file: File,
): Promise<string> {
  const resized = await resizeImage(file, purpose === 'website_cover' ? 2400 : 1600);
  return uploadFile(weddingId, purpose, resized);
}

function problemText(error: unknown): string {
  if (error instanceof ImageProblem) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "The photo couldn't be uploaded. Try again.";
}

/** "Start with a cover photo" on the first-visit screen is a label for this input. */
export const COVER_INPUT_ID = 'website-cover-input';

export function CoverCard({ weddingId, wedding, settings, save, readOnly, isAdmin }: CardProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useFilePicker(
    async ([file]) => {
      if (!file) return;
      setBusy(true);
      setProblem(null);
      try {
        const key = await uploadPhoto(weddingId, 'website_cover', file);
        await save({ coverKey: key });
      } catch (error) {
        setProblem(problemText(error));
      } finally {
        setBusy(false);
      }
    },
    false,
    COVER_INPUT_ID,
  );

  const cover = settings.cover;
  return (
    <section className={cn(card, 'space-y-4')}>
      {picker.input}
      <CardHeader
        title="Cover Photo"
        description="The first thing guests see when they open your website."
        section="hero"
        settings={settings}
        save={save}
        readOnly={readOnly}
      />
      {cover ? (
        <>
          <div className="bg-background-alt relative aspect-video w-full overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
            <img src={cover.url} alt="Cover photo" className="size-full object-cover" />
            {busy && <Busy />}
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={picker.open}
                  disabled={busy}
                  className="bg-background text-primary hover:bg-background-alt inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                >
                  <Upload aria-hidden className="size-4" />
                  Replace photo
                </button>
                <button
                  type="button"
                  onClick={() => void save({ coverKey: null })}
                  disabled={busy}
                  className="text-danger-text hover:bg-danger-bg inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                >
                  <Trash2 aria-hidden className="size-4" />
                  Remove
                </button>
              </div>
              <span className="text-text-muted text-xs">Best in landscape, e.g. 1920 × 1080</span>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={picker.open}
          disabled={readOnly || busy}
          className="border-border bg-background hover:bg-background-alt relative flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors disabled:cursor-not-allowed"
        >
          <span className="bg-primary-tint text-primary flex size-12 items-center justify-center rounded-full">
            <ImagePlus aria-hidden className="size-6" />
          </span>
          <span className="text-primary font-medium">Upload a cover photo</span>
          <span className="text-text-muted text-xs">JPG, PNG or WebP · resized for the web</span>
          {busy && <Busy />}
        </button>
      )}
      {problem && (
        <p role="alert" className="text-danger-text text-sm">
          {problem}
        </p>
      )}
      <div className="bg-background flex items-start gap-2 rounded-xl p-4 text-sm">
        <Info aria-hidden className="text-gold-deep mt-0.5 size-4 shrink-0" />
        <p>
          Names, date and city come from your wedding details:{' '}
          <strong className="text-primary font-medium">
            {wedding.brideName} &amp; {wedding.groomName} · {formatFullDate(wedding.weddingDate)}
            {wedding.city && ` · ${wedding.city}`}
          </strong>
          .
          {isAdmin && (
            <Link
              href={`/app/${weddingId}/settings`}
              className="text-gold-deep ml-1 font-medium hover:underline"
            >
              Edit in Settings →
            </Link>
          )}
        </p>
      </div>
    </section>
  );
}

function Busy() {
  return (
    <span className="bg-surface/70 absolute inset-0 flex items-center justify-center text-sm font-medium">
      Uploading…
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function StoryCard({ settings, save, readOnly }: CardProps) {
  const [text, setText] = useState(settings.story);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saved = useRef(settings.story);

  function commit(value: string) {
    clearTimeout(timer.current);
    if (value.trim() === saved.current.trim()) return;
    saved.current = value;
    void save({ story: value });
  }

  return (
    <section className={cn(card, 'space-y-4')}>
      <CardHeader
        title="Our Story"
        description="A personal note to welcome family and friends."
        section="story"
        settings={settings}
        save={save}
        readOnly={readOnly}
      />
      <div>
        <label htmlFor="website-story" className="sr-only">
          Our story
        </label>
        <textarea
          id="website-story"
          rows={5}
          value={text}
          maxLength={MAX_STORY_LENGTH}
          disabled={readOnly}
          placeholder="How you met, what you love about each other, what this day means to you…"
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => commit(value), 1200);
          }}
          onBlur={() => commit(text)}
          className="border-border bg-background focus:bg-surface focus:ring-primary rounded-input w-full resize-y border p-4 outline-none focus:ring-1"
        />
        <p className="text-text-muted mt-1 text-right text-xs">
          {text.length.toLocaleString('en-IN')} / {MAX_STORY_LENGTH.toLocaleString('en-IN')}{' '}
          characters · a blank line starts a new paragraph
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function EventsCard({
  weddingId,
  settings,
  save,
  readOnly,
  events,
  onChanged,
}: CardProps & { events: WeddingEvent[]; onChanged: () => void }) {
  const update = useUpdateEvent(weddingId);
  const reorder = useReorderEvents(weddingId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = events.findIndex((e) => e.id === active.id);
    const to = events.findIndex((e) => e.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(events, from, to), { onSuccess: onChanged });
  }

  return (
    <section className={cn(card, 'space-y-4')}>
      <CardHeader
        title="Events"
        description="Choose which celebrations appear on your website. Drag to change the order."
        section="events"
        settings={settings}
        save={save}
        readOnly={readOnly}
      />
      {events.length === 0 ? (
        <p className="text-text-muted bg-background rounded-xl p-4 text-sm">
          No events yet.{' '}
          <Link
            href={`/app/${weddingId}/events`}
            className="text-primary font-medium hover:underline"
          >
            Add your events
          </Link>{' '}
          and they&apos;ll appear here.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  disabled={readOnly || reorder.isPending}
                  onToggle={(showOnWebsite) =>
                    update.mutate(
                      { eventId: event.id, input: { showOnWebsite } },
                      { onSuccess: onChanged },
                    )
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function EventRow({
  event,
  disabled,
  onToggle,
}: {
  event: WeddingEvent;
  disabled: boolean;
  onToggle: (shown: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: event.id, disabled });
  const place = event.venueName || event.address;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'bg-background hover:bg-background-alt flex items-center justify-between gap-3 rounded-xl p-4 transition-colors',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-4">
        <input
          type="checkbox"
          checked={event.showOnWebsite}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-primary size-5 shrink-0"
        />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{event.name}</span>
          <span className="text-text-muted truncate text-xs">
            {formatDate(event.date)}
            {place && ` · ${place}`}
          </span>
        </span>
      </label>
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Move ${event.name}`}
        disabled={disabled}
        className="text-text-muted hover:text-text cursor-grab touch-none rounded p-1 disabled:cursor-default"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-5" />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function PhotosCard({ weddingId, settings, save, readOnly }: CardProps) {
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const keys = settings.photos.map((p) => p.key);
  const room = MAX_WEBSITE_PHOTOS - keys.length;

  const picker = useFilePicker(async (files) => {
    setProblem(null);
    const chosen = files.slice(0, room);
    if (files.length > room) {
      // Says what happened to this choice, so it stays true after the upload.
      const left = files.length - room;
      setProblem(
        `The website holds ${MAX_WEBSITE_PHOTOS} photos, so ${left} of the ${files.length} you chose ${left === 1 ? "wasn't" : "weren't"} added.`,
      );
    }
    setBusy(chosen.length);
    const added: string[] = [];
    for (const file of chosen) {
      try {
        added.push(await uploadPhoto(weddingId, 'website_photo', file));
      } catch (error) {
        setProblem(problemText(error));
      }
      setBusy((n) => n - 1);
    }
    if (added.length > 0) await save({ photoKeys: [...keys, ...added] });
  }, true);

  return (
    <section className={cn(card, 'space-y-4')}>
      {picker.input}
      <CardHeader
        title="Photos"
        description="Up to 12 photos for your gallery section."
        section="photos"
        settings={settings}
        save={save}
        readOnly={readOnly}
        extra={
          <span className="bg-background-alt text-text-muted rounded-full px-2 py-0.5 text-xs font-semibold">
            {keys.length} of {MAX_WEBSITE_PHOTOS} photos
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {settings.photos.map((photo, i) => (
          <div
            key={photo.key}
            className="group bg-background-alt relative aspect-square overflow-hidden rounded-xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
            <img src={photo.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
            {!readOnly && (
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => void save({ photoKeys: keys.filter((k) => k !== photo.key) })}
                className="bg-surface/85 absolute top-1 right-1 flex size-7 items-center justify-center rounded-full shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div
            key={`busy-${i}`}
            className="bg-background-alt text-text-muted flex aspect-square animate-pulse items-center justify-center rounded-xl text-xs"
          >
            Uploading…
          </div>
        ))}
        {!readOnly && room - busy > 0 && (
          <button
            type="button"
            onClick={picker.open}
            disabled={busy > 0}
            className="bg-background hover:bg-background-alt flex aspect-square flex-col items-center justify-center rounded-xl p-2 text-center transition-colors"
          >
            <span className="bg-background-alt text-primary mb-1 flex size-8 items-center justify-center rounded-full">
              <Plus aria-hidden className="size-5" />
            </span>
            <span className="text-primary text-xs font-semibold">Add photos</span>
            <span className="text-text-muted text-[10px]">JPG, PNG or WebP</span>
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-danger-text text-sm">
          {problem}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function LiveStreamCard({ wedding, settings, save, readOnly }: CardProps) {
  const current = settings.liveStream;
  const start = current?.startsAt ? localParts(new Date(current.startsAt), wedding.timezone) : null;
  const [url, setUrl] = useState(current?.url ?? '');
  const [date, setDate] = useState(start?.date ?? '');
  const [time, setTime] = useState(start?.time ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [timeProblem, setTimeProblem] = useState<string | null>(null);

  const videoId = url.trim() ? youTubeVideoId(url) : null;

  function commit(next: { url?: string; date?: string; time?: string } = {}) {
    const u = (next.url ?? url).trim();
    const d = next.date ?? date;
    const t = next.time ?? time;
    if (!u) {
      setProblem(null);
      if (current) void save({ liveStream: null });
      return;
    }
    if (!youTubeVideoId(u)) {
      setProblem(
        "This isn't a YouTube video link. Paste the link of the video or live stream (youtu.be/…, youtube.com/watch?v=… or youtube.com/live/…).",
      );
      return;
    }
    // A date needs a time: a blank time is never taken as midnight. Until both are set the
    // saved start stays as it was.
    if (d && !t) return;
    let startsAt: string | null = null;
    if (d) {
      const at = localTimeToUtc(d, t, wedding.timezone);
      if (!at) {
        // Skipped when the clocks go forward there; a repeated time means the first one.
        setTimeProblem(
          `${t} doesn't exist on ${formatFullDate(d)} in ${timezoneLabel(wedding.timezone)} because the clocks change. Choose another time.`,
        );
        return;
      }
      startsAt = at.toISOString();
    }
    setTimeProblem(null);
    setProblem(null);
    if (u === current?.url && startsAt === (current?.startsAt ?? null)) return;
    void save({ liveStream: { url: u, startsAt, enabled: true } });
  }

  const startLabel =
    date &&
    `${formatFullDate(date)}${time ? ` · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${time}`))}` : ''}`;

  return (
    <section className={cn(card, 'space-y-4')}>
      <CardHeader
        title="Live Stream"
        description="Stream the ceremony for family who can't be there."
        section="liveStream"
        settings={settings}
        save={save}
        readOnly={readOnly}
      />
      <div>
        <label htmlFor="website-stream-url" className="mb-1 block text-sm font-medium">
          YouTube link
        </label>
        <div
          className={cn(
            'border-border bg-background rounded-input flex items-center border px-4 py-2',
            problem && 'border-danger-text',
          )}
        >
          <MonitorPlay aria-hidden className="text-gold-deep mr-2 size-5 shrink-0" />
          <input
            id="website-stream-url"
            type="url"
            inputMode="url"
            value={url}
            disabled={readOnly}
            placeholder="https://youtube.com/live/…"
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => commit()}
            aria-invalid={problem ? true : undefined}
            aria-describedby="website-stream-hint"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
          {videoId && (
            <BadgeCheck
              aria-label="Valid YouTube link"
              className="text-success-text size-5 shrink-0"
            />
          )}
        </div>
        <p
          id="website-stream-hint"
          className={cn('mt-1 text-xs', problem ? 'text-danger-text' : 'text-text-muted')}
        >
          {problem ?? "Only YouTube links. We use YouTube's privacy-enhanced player."}
        </p>
      </div>

      {videoId && (
        <div className="bg-background flex items-center gap-4 rounded-xl p-2">
          <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail */}
            <img
              src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <span className="bg-primary/40 absolute inset-0" />
            <PlayCircle aria-hidden className="relative size-7 text-white" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-primary truncate font-medium">
              {wedding.brideName} &amp; {wedding.groomName}&apos;s live stream
            </span>
            <span className="text-text-muted text-xs">
              {startLabel ? `Scheduled for ${startLabel}` : 'Shown as soon as you publish'}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="website-stream-date" className="mb-1 block text-sm font-medium">
            Starts at
          </label>
          <div className="flex gap-2">
            <input
              id="website-stream-date"
              type="date"
              value={date}
              disabled={readOnly || !url.trim()}
              onChange={(e) => {
                setDate(e.target.value);
                commit({ date: e.target.value });
              }}
              className="border-border bg-background rounded-input min-w-0 flex-1 border px-3 py-2 disabled:opacity-60"
            />
            <input
              aria-label="Start time"
              type="time"
              value={time}
              disabled={readOnly || !url.trim() || !date}
              onChange={(e) => setTime(e.target.value)}
              required={Boolean(date)}
              onBlur={() => commit()}
              className="border-border bg-background rounded-input w-28 border px-3 py-2 disabled:opacity-60"
            />
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Timezone</p>
          <div className="bg-background text-text-muted rounded-input border-border flex items-center border px-3 py-2">
            <Clock aria-hidden className="mr-2 size-4" />
            {timezoneLabel(wedding.timezone)}
          </div>
        </div>
      </div>
      {timeProblem ? (
        <p role="alert" className="text-danger-text text-sm">
          {timeProblem}
        </p>
      ) : (
        date &&
        !time && (
          <p className="text-pending-text text-sm">
            Add a start time to schedule the countdown, or clear the date.
          </p>
        )
      )}
      <p className="text-text-muted text-xs">
        Before the start time guests see a countdown, then the player. Leave the date and time empty
        to show the video straight away.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ */

export function GalleryCard() {
  return (
    <section className={cn(card, 'flex items-center justify-between gap-4 opacity-65')}>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-2xl">Photo Gallery</h2>
          <SoonTag />
        </div>
        <p className="text-text-muted text-sm">
          Link to your private photo gallery so guests can see and add photos after each event.
        </p>
      </div>
      <Switch aria-label="Show the photo gallery on the website" checked={false} disabled />
    </section>
  );
}

export function SearchCard({ settings, save, readOnly, isAdmin }: CardProps) {
  return (
    <section className={cn(card, 'flex items-center justify-between gap-4')}>
      <div>
        <h2 className="text-primary text-2xl">Search Engines</h2>
        <p className="mt-1 font-medium">Let Google show this website</p>
        <p className="text-text-muted text-sm">
          Off keeps your site private to people who have the link.
          {!isAdmin && ' Only Admins can change this.'}
        </p>
      </div>
      <Switch
        aria-label="Let Google show this website"
        checked={settings.indexable}
        disabled={readOnly || !isAdmin}
        onCheckedChange={(indexable) => void save({ indexable })}
      />
    </section>
  );
}
