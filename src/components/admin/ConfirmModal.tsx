'use client';

import type { ReactNode } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** Label tombol konfirmasi (default destruktif "Ya, hapus"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** True saat aksi sedang berjalan — tombol loading + nonaktif. */
  loading?: boolean;
  children?: ReactNode;
}

/**
 * Dialog konfirmasi aksi destruktif — pengganti dialog konfirmasi native.
 * Escape/overlay menutup, fokus terjebak di dialog (Modal), tombol utama danger.
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Ya, hapus',
  cancelLabel = 'Batal',
  loading = false,
  children,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" size="sm" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p>Tindakan ini tidak bisa dibatalkan.</p>}
    </Modal>
  );
}
