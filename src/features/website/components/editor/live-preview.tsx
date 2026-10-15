'use client';

import { Lock, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/cn';
import { previewUrl } from '../../api';

// The editor's live preview (Stitch "Website": sticky phone frame with a Desktop / Phone
// toggle). It shows the team's preview page and reloads after every save.

const DESKTOP_WIDTH = 1280;

export function LivePreview({
  slug,
  displayUrl,
  version,
}: {
  slug: string;
  displayUrl: string;
  /** Changes after each save, reloading the frame. */
  version: number;
}) {
  const [mode, setMode] = useState<'phone' | 'desktop'>('phone');
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry!.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, [mode]);

  const src = previewUrl(slug, true);
  const scale = boxWidth > 0 ? boxWidth / DESKTOP_WIDTH : 0.3;

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex w-full max-w-[390px] items-center justify-between px-1">
        <span className="text-gold-deep text-[11px] font-semibold tracking-wider uppercase">
          Live preview
        </span>
        <div
          role="group"
          aria-label="Preview size"
          className="bg-background-alt inline-flex rounded-full p-0.5"
        >
          {(['desktop', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors',
                mode === m
                  ? 'bg-surface text-primary shadow-sm'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === 'phone' ? (
        <div className="bg-text flex w-full max-w-[390px] flex-col rounded-[44px] p-3 shadow-2xl">
          <div className="bg-background relative flex h-[720px] flex-col overflow-hidden rounded-[36px]">
            <div className="text-primary flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold">
              <span>9:41</span>
              <span className="h-4 w-20 rounded-full bg-black" />
              <span className="w-8" />
            </div>
            <UrlBar url={displayUrl} />
            <iframe
              key={`phone-${version}`}
              src={src}
              title="Website preview on a phone"
              className="w-full flex-1 border-0"
            />
          </div>
        </div>
      ) : (
        <div className="border-border bg-surface w-full overflow-hidden rounded-xl border shadow-xl">
          <UrlBar url={displayUrl} />
          <div
            ref={boxRef}
            className="relative w-full overflow-hidden"
            style={{ height: 800 * scale }}
          >
            <iframe
              key={`desktop-${version}`}
              src={src}
              title="Website preview on a computer"
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{ width: DESKTOP_WIDTH, height: 800, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function UrlBar({ url }: { url: string }) {
  return (
    <div className="bg-background-alt/80 border-border flex items-center justify-between gap-2 border-b px-4 py-1.5">
      <Lock aria-hidden className="text-text-muted size-3" />
      <span className="truncate text-[11px] font-medium">{url}</span>
      <RotateCw aria-hidden className="text-text-muted size-3" />
    </div>
  );
}
