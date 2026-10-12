'use client';

import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useAddStarterTasks, useStarterChecklist } from '@/features/tasks/hooks';
import type { StarterKey, StarterTask } from '@/modules/tasks/tasks.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { formatDate } from '@/shared/dates';

// "Starter checklist" (Stitch, PRD TASK-3): common wedding tasks with due dates counted back from
// the wedding. Pick the ones you need; they're added unassigned, ready to edit.

const BANDS = [
  { label: '10–12 months before', min: 10 },
  { label: '6–9 months before', min: 6 },
  { label: '3–5 months before', min: 3 },
  { label: '1–2 months before', min: 0 },
] as const;

function bandOf(task: StarterTask) {
  return BANDS.find((band) => task.suggestedMonthsBefore >= band.min)!.label;
}

export function StarterDialog({
  weddingId,
  weddingDate,
  onClose,
}: {
  weddingId: string;
  weddingDate: string;
  onClose: () => void;
}) {
  const { data: items, error: loadError, isPending } = useStarterChecklist(weddingId);
  const mutation = useAddStarterTasks(weddingId);
  // Everything not yet added starts ticked; the couple unticks what they don't need.
  const [unticked, setUnticked] = useState<Set<StarterKey>>(new Set());
  const available = items?.filter((item) => !item.alreadyAdded) ?? [];
  const chosen = available.filter((item) => !unticked.has(item.key));
  const allChosen = available.length > 0 && chosen.length === available.length;

  function toggle(key: StarterKey, on: boolean) {
    setUnticked((current) => {
      const next = new Set(current);
      if (on) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const error = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : 'Could not reach the server. Check your connection and try again.'
    : loadError
      ? "We couldn't load the checklist. Please try again."
      : null;
  const count = chosen.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Starter checklist"
      description={
        <>
          Common wedding tasks with due dates counted back from your wedding on{' '}
          <strong className="text-text font-medium">{formatDate(weddingDate)}</strong>. Pick the
          ones you need; you can edit them after.
        </>
      }
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" className="h-11 px-5" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 gap-2 px-6"
            disabled={count === 0 || mutation.isPending}
            onClick={() =>
              mutation.mutate({ keys: chosen.map((item) => item.key) }, { onSuccess: onClose })
            }
          >
            {mutation.isPending ? 'Adding…' : `Add ${count} ${count === 1 ? 'task' : 'tasks'}`}
          </Button>
        </>
      }
    >
      <FormAlert message={error} />
      {isPending ? (
        <p role="status" className="text-text-muted py-8 text-center text-sm">
          Loading the checklist…
        </p>
      ) : items && available.length === 0 ? (
        <p className="text-text-muted flex flex-col items-center gap-3 py-8 text-center text-sm">
          <ListChecks aria-hidden className="text-primary size-6" />
          You&apos;ve added every task from the checklist.
        </p>
      ) : items ? (
        <div className="space-y-5">
          <label className="flex items-center justify-between gap-3 border-b pb-3 text-sm">
            <span className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={allChosen}
                onChange={(e) =>
                  setUnticked(e.target.checked ? new Set() : new Set(available.map((i) => i.key)))
                }
                className="accent-primary size-4.5"
              />
              Select all
            </span>
            <span className="bg-pending-bg text-pending-text rounded-full px-2.5 py-0.5 text-xs font-medium">
              {count} selected
            </span>
          </label>
          {BANDS.map((band) => {
            const rows = items.filter((item) => bandOf(item) === band.label);
            if (rows.length === 0) return null;
            return (
              <section key={band.label}>
                <h3 className="text-pending-text mb-2 font-sans text-[11px] font-semibold tracking-[0.1em] uppercase">
                  {band.label}
                </h3>
                <ul className="space-y-1">
                  {rows.map((item) => {
                    const ticked = !item.alreadyAdded && !unticked.has(item.key);
                    return (
                      <li key={item.key}>
                        <label
                          className={cn(
                            'rounded-input flex items-center gap-3 px-3 py-2.5 text-sm',
                            item.alreadyAdded
                              ? 'bg-background text-text-muted cursor-default'
                              : 'hover:bg-background cursor-pointer',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={ticked}
                            disabled={item.alreadyAdded}
                            onChange={(e) => toggle(item.key, e.target.checked)}
                            className="accent-primary size-4.5 shrink-0"
                          />
                          <span className={cn('flex-1', item.alreadyAdded && 'line-through')}>
                            {item.title}
                          </span>
                          <span className="text-text-muted text-xs whitespace-nowrap">
                            {formatDate(item.dueDate)}
                          </span>
                          {item.alreadyAdded && (
                            <span className="bg-background-alt rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap">
                              Already added
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
    </Dialog>
  );
}
