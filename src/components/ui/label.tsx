import { cn } from '@/shared/cn';

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('text-text text-sm font-medium', className)}
      {...props}
    />
  );
}

export { Label };
