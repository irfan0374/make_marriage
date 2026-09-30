import { cn } from '@/shared/cn';

// Inputs: 12px radius, plum border on focus (architecture §18.4).
function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'border-border bg-surface text-text placeholder:text-text-muted rounded-input h-11 w-full border px-3.5 text-sm transition-colors outline-none',
        'focus-visible:border-primary focus-visible:ring-primary/15 focus-visible:ring-3',
        'aria-invalid:border-danger-text aria-invalid:ring-danger-text/10 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
