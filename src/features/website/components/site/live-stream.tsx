'use client';

import { CalendarPlus, Clock, PlayCircle, Video } from 'lucide-react';
import type { WebsiteTheme } from '@/modules/website/website.schemas';
import { cn } from '@/shared/cn';
import { calendarLink, streamStartLabel } from '../../format';
import { useNow } from '../../use-now';

// The live stream (PRD WEB-5): a countdown until the start time, then YouTube's
// privacy-enhanced player. The stream itself is YouTube's; we only embed it. Which of the two
// shows depends on the time, so the server and the browser's first render show a neutral poster
// and the browser picks once it has loaded; the clock keeps running so the countdown turns into
// the player, and the "Live" badge goes after its window, while the page stays open.

/** Shown as live for a few hours after the start time. */
const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: 'Days', value: Math.floor(s / 86400) },
    { label: 'Hours', value: Math.floor((s % 86400) / 3600) },
    { label: 'Mins', value: Math.floor((s % 3600) / 60) },
    { label: 'Secs', value: s % 60 },
  ].map((p) => ({
    ...p,
    value: p.label === 'Days' ? String(p.value) : String(p.value).padStart(2, '0'),
  }));
}

export function LivePlayer({ videoId, title }: { videoId: string; title: string }) {
  return (
    <iframe
      className="absolute inset-0 size-full"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

/** The video's own thumbnail, shown until the browser knows whether the stream has started. */
function Poster({ videoId }: { videoId: string }) {
  return (
    <div className="absolute inset-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube's own thumbnail */}
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        className="size-full object-cover opacity-60"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <PlayCircle aria-hidden className="size-14 text-white/80" />
      </span>
    </div>
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-live inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium tracking-wider text-white uppercase',
        className,
      )}
    >
      <span className="size-1.5 animate-ping rounded-full bg-white" />
      Live
    </span>
  );
}

interface LiveStreamProps {
  theme: WebsiteTheme;
  videoId: string;
  startsAt: string | null;
  timeZone: string;
  couple: string;
  siteUrl: string;
}

/** The 16:9 frame: a countdown before the start, then the player. */
export function LiveStream({
  theme,
  videoId,
  startsAt,
  timeZone,
  couple,
  siteUrl,
}: LiveStreamProps) {
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const now = useNow(1000);
  const before = start !== null && now !== null && now < start;
  const live = start !== null && now !== null && !before && now < start + LIVE_WINDOW_MS;
  const title = `The wedding of ${couple}`;

  return (
    <div>
      <div
        className={cn(
          'relative aspect-video w-full overflow-hidden bg-black shadow-xl',
          theme === 'elegant' ? 'rounded-3xl' : 'rounded-2xl',
        )}
      >
        {now === null ? (
          <Poster videoId={videoId} />
        ) : before ? (
          <Countdown
            theme={theme}
            remaining={start! - now}
            when={streamStartLabel(startsAt!, timeZone)}
            title={title}
            calendarUrl={calendarLink(`${couple}: live stream`, startsAt!, siteUrl)}
          />
        ) : (
          <>
            <LivePlayer videoId={videoId} title={title} />
            {live && <LiveBadge className="pointer-events-none absolute top-3 left-3" />}
          </>
        )}
      </div>
      {/* The countdown already shows the start; Elegant adds its calendar link below. */}
      {startsAt && now !== null && !before && (
        <p className="text-text-muted mt-4 flex items-center gap-1.5 px-1 text-sm">
          <Clock aria-hidden className="text-gold-deep size-4" />
          {streamStartLabel(startsAt, timeZone)}
        </p>
      )}
      {startsAt && (now === null || before) && theme === 'elegant' && (
        <p className="text-text-muted mt-4 px-1 text-right text-sm">
          <a
            href={calendarLink(`${couple}: live stream`, startsAt, siteUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-site underline"
          >
            Add to Google Calendar
          </a>
        </p>
      )}
    </div>
  );
}

interface CountdownProps {
  theme: WebsiteTheme;
  remaining: number;
  when: string;
  title: string;
  calendarUrl: string;
}

function Countdown({ theme, remaining, when, title, calendarUrl }: CountdownProps) {
  const units = parts(remaining);
  if (theme === 'modern') {
    return (
      <div className="bg-text absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
        <span className="bg-site mb-4 flex size-16 items-center justify-center rounded-full">
          <Video aria-hidden className="size-7" />
        </span>
        <span className="text-gold text-[11px] font-medium tracking-[0.2em] uppercase">
          Next transmission
        </span>
        <h3 className="mt-1 text-2xl font-medium sm:text-[28px]">{title}</h3>
        <p className="mt-1 text-sm text-white/70">Scheduled for {when}</p>
        <CountdownUnits units={units} className="mt-5" boxClass="bg-white/10" />
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-site hover:bg-site-deep mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-medium tracking-wider uppercase transition-colors"
        >
          <CalendarPlus aria-hidden className="size-4" />
          Add to calendar
        </a>
      </div>
    );
  }
  if (theme === 'elegant') {
    return (
      <div className="from-site via-site-deep to-text absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b p-6 text-center text-white">
        <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
          <Video aria-hidden className="size-7" />
        </span>
        <span className="text-gold text-xs font-medium tracking-[0.2em] uppercase">
          Broadcast begins
        </span>
        <h3 className="mt-1 mb-5 text-2xl sm:text-[28px]">{when}</h3>
        <CountdownUnits units={units} boxClass="bg-white/10" />
      </div>
    );
  }
  return (
    <div className="from-site-deep via-site-deep/80 to-site-deep/60 absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t p-6 text-center text-white">
      <span className="text-gold mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1 backdrop-blur-md">
        <Clock aria-hidden className="size-4" />
        <span className="text-[11px] font-medium tracking-wider uppercase">Starts {when}</span>
      </span>
      <h3 className="mb-5 max-w-lg text-2xl sm:text-[28px]">{title}</h3>
      <CountdownUnits units={units} boxClass="bg-white/10" />
      <a
        href={calendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-gold-deep mt-5 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-medium text-white shadow-md transition-opacity hover:opacity-90"
      >
        <CalendarPlus aria-hidden className="size-4" />
        Add calendar reminder
      </a>
    </div>
  );
}

function CountdownUnits({
  units,
  className,
  boxClass,
}: {
  units: { label: string; value: string }[];
  className?: string;
  boxClass: string;
}) {
  return (
    <div className={cn('grid w-full max-w-sm grid-cols-4 gap-2 sm:gap-3', className)}>
      {units.map((u) => (
        <div key={u.label} className={cn('rounded-xl p-2 backdrop-blur-md sm:p-3', boxClass)}>
          <span className="font-heading text-gold block text-xl tabular-nums sm:text-[28px]">
            {u.value}
          </span>
          <span className="text-[10px] tracking-wider text-white/70 uppercase sm:text-[11px]">
            {u.label}
          </span>
        </div>
      ))}
    </div>
  );
}
