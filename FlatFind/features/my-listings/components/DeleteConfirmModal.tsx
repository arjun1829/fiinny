'use client';

import { Modal, ModalCloseButton, Button } from '@/components/ui';

interface DeleteConfirmModalProps {
  open: boolean;
  listingTitle: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Reuses the Modal primitive already established for the listing detail
// intercepting route (app/@modal) — same overlay/backdrop/escape-to-close
// behavior, just a small confirmation body instead of a full detail view.
export function DeleteConfirmModal({ open, listingTitle, busy, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} maxWidthClassName="max-w-[420px]">
      <div className="p-7 text-center">
        <div className="mb-4 flex justify-end">
          <ModalCloseButton onClick={onCancel} />
        </div>
        <div className="mb-3 text-3xl">🗑️</div>
        <h2 className="mb-2 font-display text-lg font-bold text-ink">Delete this listing?</h2>
        <p className="mb-6 text-sm text-muted">
          &ldquo;{listingTitle}&rdquo; will be permanently removed. This can&apos;t be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" type="button" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="warn"
            type="button"
            className="flex-1 bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
