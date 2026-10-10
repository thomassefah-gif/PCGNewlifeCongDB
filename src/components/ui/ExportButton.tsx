import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import Button, { type ButtonProps } from './Button';
import { exportToCSV } from '../../lib/csv';

interface ExportButtonProps<T> {
  data: T[];
  filename: string;
  label: string;
  isMemberData?: boolean;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
  icon?: ReactNode;
  loading?: boolean;
  onExport?: () => void | Promise<void>;
}

export default function ExportButton<T>({
  data,
  filename,
  label,
  isMemberData = false,
  disabled = false,
  variant = 'outline',
  size = 'md',
  className,
  icon,
  loading = false,
  onExport,
}: ExportButtonProps<T>) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      icon={icon ?? <Download aria-hidden="true" size={16} />}
      disabled={disabled || data.length === 0}
      loading={loading}
      className={className}
      onClick={() => onExport ? void onExport() : exportToCSV(data, { filename, isMemberData })}
    >
      {label}
    </Button>
  );
}
