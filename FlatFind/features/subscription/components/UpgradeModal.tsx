'use client';

import { Modal, ModalCloseButton, Button } from '@/components/ui';
import { useRazorpayCheckout } from '../hooks/useRazorpayCheckout';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

const FEATURES = ['Unlimited contacts', 'Real-time listings', 'Full descriptions', 'Save & get alerts'];

// Same Modal/ModalCloseButton primitives LoginModal.tsx already uses — the
// upgrade popup from the Freemium Model spec (launch-price strikethrough,
// feature list, Razorpay CTA), built fresh against FlatFind's own design
// system rather than ported from KrishiDukaan-v2's UI.
export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const { startCheckout, loading, error } = useRazorpayCheckout();

  const handleUpgrade = () => {
    startCheckout(onClose);
  };

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-[420px]">
      <div className="p-8 text-center">
        <div className="mb-[6px] flex items-center justify-end">
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="mb-2 text-[13px] font-extrabold tracking-[0.08em] text-brand-2">🎉 LAUNCH OFFER</div>
        <div className="mb-4 font-display text-2xl font-extrabold text-ink">FlatFind Pro</div>

        <div className="mb-5">
          <span className="mr-2 text-base font-semibold text-[#bbbbbb] line-through">₹1,499/mo</span>
          <span className="font-display text-[32px] font-black text-ink">₹499</span>
          <span className="ml-1 text-sm font-bold text-brand-2">67% OFF</span>
        </div>

        <ul className="mb-6 space-y-2 text-left">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-ink-2">
              <span className="text-brand-2">✓</span>
              {feature}
            </li>
          ))}
        </ul>

        {error && <div className="mb-3 text-[12.5px] text-red-600">{error}</div>}

        <Button variant="pro" className="mb-3 w-full py-[13px] text-[15px]" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Opening secure checkout…' : 'Get Pro for ₹499/month →'}
        </Button>

        <div className="text-xs text-muted">🔒 Secure via Razorpay</div>
      </div>
    </Modal>
  );
}
