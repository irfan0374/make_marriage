'use client';

import { ChevronDown } from 'lucide-react';

// A compact filter dropdown for list pages ("Category: All"), shared by Guests, Vendors and
// Expenses.

const select =
  'border-border bg-surface hover:border-primary/40 h-10 max-w-52 appearance-none truncate rounded-full border pr-9 pl-4 text-sm';

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <span className="relative shrink-0">
      <select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={select}
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="text-text-muted pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2"
      />
    </span>
  );
}
