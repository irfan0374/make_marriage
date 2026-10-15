'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { useExpenseCategories, useSaveExpenseCategories } from '@/features/expenses/hooks';
import {
  categoryLabel,
  CATEGORY_NAME_MAX,
  expenseCategoriesSchema,
  MAX_CUSTOM_CATEGORIES,
  PRESET_CATEGORIES,
} from '@/modules/expenses/expenses.schemas';
import { ApiError } from '@/shared/api-client';

// "Expense categories" in Settings (Stitch "Settings", api-spec §13.7): the 12 preset categories
// plus the couple's own. Admins add and remove their own; one still used by an expense stays.
// Saved straight away, separately from the wedding details form above.

const card = 'border-border bg-surface rounded-card border p-6 md:p-8';

export function ExpenseCategoriesSettings({
  weddingId,
  readOnly,
}: {
  weddingId: string;
  readOnly: boolean;
}) {
  const { data: categories } = useExpenseCategories(weddingId);
  const save = useSaveExpenseCategories(weddingId);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = categories ?? [];

  function apply(next: string[], onDone?: () => void) {
    const parsed = expenseCategoriesSchema.safeParse({ categories: next });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the category name');
      return;
    }
    setError(null);
    save.mutate(parsed.data.categories, {
      onSuccess: onDone,
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.'),
    });
  }

  return (
    <section className={card} aria-labelledby="expense-categories">
      <h2 id="expense-categories" className="text-xl">
        Expense categories
      </h2>
      <p className="text-text-muted mt-1 text-sm">
        Everyone picks from these when logging an expense. Add your own for anything the list
        doesn&apos;t cover.
      </p>

      <p className="text-text-muted mt-5 text-xs font-semibold tracking-[0.08em] uppercase">
        Built in
      </p>
      <p className="mt-2 flex flex-wrap gap-1.5">
        {PRESET_CATEGORIES.map((c) => (
          <span key={c} className="bg-background rounded-full px-3 py-1 text-xs">
            {categoryLabel(c)}
          </span>
        ))}
      </p>

      <p className="text-text-muted mt-5 text-xs font-semibold tracking-[0.08em] uppercase">
        Your categories ({list.length}/{MAX_CUSTOM_CATEGORIES})
      </p>
      {list.length === 0 ? (
        <p className="text-text-muted mt-2 text-sm">None yet.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {list.map((c) => (
            <li
              key={c}
              className="bg-primary-tint text-primary flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3 text-xs font-medium"
            >
              {c}
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  disabled={save.isPending}
                  onClick={() => apply(list.filter((x) => x !== c))}
                  className="hover:bg-primary/10 rounded-full p-0.5"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            apply([...list, name.trim()], () => setName(''));
          }}
        >
          <label className="sr-only" htmlFor="new-expense-category">
            New category
          </label>
          <input
            id="new-expense-category"
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mehendi artist"
            className="border-border bg-surface rounded-input h-10 min-w-0 flex-1 border px-3.5 text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-10 gap-1.5 px-4"
            disabled={save.isPending || !name.trim() || list.length >= MAX_CUSTOM_CATEGORIES}
          >
            <Plus aria-hidden className="size-4" />
            Add
          </Button>
        </form>
      )}
      <div className="mt-3">
        <FormAlert message={error} />
      </div>
    </section>
  );
}
