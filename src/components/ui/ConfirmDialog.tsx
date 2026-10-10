import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm action',
  message,
  confirmLabel = 'Confirm',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
          <AlertTriangle aria-hidden="true" size={22} />
        </div>
        <p className="pt-1 text-sm leading-6 text-slate-600">{message}</p>
      </div>
      <div className="mt-7 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="danger" onClick={() => void onConfirm()} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
