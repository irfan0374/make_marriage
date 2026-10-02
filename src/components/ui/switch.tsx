'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from '@/shared/cn';

// On/off toggle: plum when on, border colour when off (architecture §18).
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer bg-border data-[checked]:bg-primary inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none',
        'focus-visible:ring-primary/25 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="bg-surface pointer-events-none block size-5 rounded-full shadow-sm transition-transform data-[checked]:translate-x-5"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
