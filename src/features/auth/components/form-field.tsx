'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FieldProps = Omit<React.ComponentProps<'input'>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
};

export function FormField({ label, error, hint, type, ...props }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={isPassword ? 'pr-11' : undefined}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="text-text-muted hover:text-text absolute inset-y-0 right-0 flex w-11 items-center justify-center"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-danger-text text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-text-muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="bg-danger-bg text-danger-text rounded-input px-3.5 py-2.5 text-sm">
      {message}
    </p>
  );
}
