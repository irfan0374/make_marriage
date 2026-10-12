'use client';

import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useDeleteTask } from '@/features/tasks/hooks';
import type { Task } from '@/modules/tasks/tasks.types';
import { ApiError } from '@/shared/api-client';
import { formatDate } from '@/shared/dates';

// "Delete this task?" (Stitch "Delete task?").

export function DeleteTaskDialog({
  weddingId,
  task,
  eventName,
  onClose,
  onDeleted,
}: {
  weddingId: string;
  task: Task;
  eventName: string | undefined;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteTask(weddingId);
  const chips = [
    eventName,
    task.assignee?.name,
    task.dueDate ? `Due ${formatDate(task.dueDate)}` : undefined,
  ].filter(Boolean);
  const error = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : 'Could not reach the server. Check your connection and try again.'
    : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Delete this task?"
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep task
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(task.id, { onSuccess: onDeleted })}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete task'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="bg-background rounded-input p-4">
          <p className="font-medium">{task.title}</p>
          {chips.length > 0 && <p className="text-text-muted mt-1 text-xs">{chips.join(' · ')}</p>}
        </div>
        <p>This can&apos;t be undone.</p>
        <FormAlert message={error} />
      </div>
    </Dialog>
  );
}
