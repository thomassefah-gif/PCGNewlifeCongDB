import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'active' | 'inactive' | 'distant' | 'primary' | 'gray';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  active: 'border-success/20 bg-success/10 text-success',
  inactive: 'border-stone-300 bg-stone-100 text-slate-600',
  distant: 'border-warning/25 bg-warning/10 text-warning',
  primary: 'border-primary/20 bg-primary/10 text-primaryDark',
  gray: 'border-stone-200 bg-stone-100 text-slate-600',
};

export default function Badge({ variant = 'gray', className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-none', variantClasses[variant], className)}
    />
  );
}
