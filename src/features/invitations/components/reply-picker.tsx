'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/shared/cn';

// One event's answer (Stitch "Personal Invitation & RSVP"): Attending or Not attending, and how
// many people are coming, from 1 up to the number invited. Used on the guest page and when the
// couple records a reply for a family.

export interface ReplyValue {
  status: 'attending' | 'declined' | null;
  attendingCount: number;
}

export function ReplyPicker({
  value,
  max,
  onChange,
  question,
  disabled = false,
}: {
  value: ReplyValue;
  max: number;
  onChange: (value: ReplyValue) => void;
  question: string;
  disabled?: boolean;
}) {
  const questionId = useId();
  const countId = useId();
  const attending = value.status === 'attending';
  const count = attending ? value.attendingCount : 0;
  const option = (selected: boolean) =>
    cn(
      'flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-60',
      selected ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-surface hover:bg-surface/70',
    );

  return (
    <div className="space-y-4">
      <p id={questionId} className="text-sm font-semibold">
        {question}
      </p>
      <div role="radiogroup" aria-labelledby={questionId} className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={attending}
          disabled={disabled}
          onClick={() =>
            onChange({ status: 'attending', attendingCount: value.attendingCount || max })
          }
          className={option(attending)}
        >
          {attending && <Check aria-hidden className="size-4" />}
          Attending
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value.status === 'declined'}
          disabled={disabled}
          onClick={() => onChange({ status: 'declined', attendingCount: value.attendingCount })}
          className={option(value.status === 'declined')}
        >
          {value.status === 'declined' && <Check aria-hidden className="size-4" />}
          Not attending
        </button>
      </div>
      {attending && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p id={countId} className="text-sm font-semibold">
              People coming
            </p>
            <p className="text-text-muted text-xs">
              {max === 1 ? '1 person invited' : `Up to ${max} people invited`}
            </p>
          </div>
          <div
            role="group"
            aria-labelledby={countId}
            className="bg-surface flex items-center gap-1 rounded-full p-1 shadow-sm"
          >
            <button
              type="button"
              aria-label="One fewer person"
              disabled={disabled || count <= 1}
              onClick={() => onChange({ ...value, attendingCount: count - 1 })}
              className="hover:bg-background flex size-10 items-center justify-center rounded-full disabled:opacity-30"
            >
              <Minus aria-hidden className="size-4" />
            </button>
            <output aria-live="polite" className="font-heading w-8 text-center text-2xl">
              {count}
            </output>
            <button
              type="button"
              aria-label="One more person"
              disabled={disabled || count >= max}
              onClick={() => onChange({ ...value, attendingCount: count + 1 })}
              className="hover:bg-background flex size-10 items-center justify-center rounded-full disabled:opacity-30"
            >
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
