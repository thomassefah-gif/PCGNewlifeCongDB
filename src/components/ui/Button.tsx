import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border border-primary bg-primary text-white shadow-sm hover:bg-primaryDark hover:border-primaryDark focus-visible:ring-primary',
  secondary: 'border border-primary/15 bg-primary/10 text-primaryDark hover:bg-primary/15 focus-visible:ring-primary',
  danger: 'border border-danger bg-danger text-white hover:bg-red-800 focus-visible:ring-danger',
  outline: 'border border-stone-300 bg-white text-slate-700 hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-primary',
  ghost: 'border border-transparent bg-transparent text-slate-600 hover:bg-stone-100 hover:text-slate-900 focus-visible:ring-primary',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'min-h-10 gap-2 rounded-xl px-3.5 text-sm',
  lg: 'min-h-12 gap-2 rounded-xl px-5 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
}
