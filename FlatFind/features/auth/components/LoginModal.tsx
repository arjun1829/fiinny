'use client';

import { useState } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { Modal, ModalCloseButton, Button } from '@/components/ui';
import { isValidIndianMobile, sendPhoneOtp, confirmPhoneOtp, resetRecaptcha } from '../lib/phone-auth';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  /** Matches the original's requireLogin(msg) — a contextual reason shown above the phone field. */
  message?: string;
}

const RECAPTCHA_CONTAINER_ID = 'flatfind-recaptcha-container';

// Mirrors #login-overlay / #login-step1 / #login-step2 (index (1).html,
// LOGIN MODAL block) — same two-step phone -> OTP UX, same field styling.
// What's different (architecture report §1.3, this is the fix): the
// original generated its own 6-digit code with Math.random(), displayed it
// in the UI as "Test OTP: 123456", and logged it to the console — anyone
// could read or bypass it. Here, sendPhoneOtp()/confirmPhoneOtp() (
// features/auth/lib/phone-auth.ts) delegate entirely to Firebase Auth's
// Phone provider: the code is generated and verified server-side, and the
// client never sees it. There is no test-OTP debug affordance in this
// version — that was itself part of the original's security gap, not a
// convenience worth preserving.
export function LoginModal({ open, onClose, message }: LoginModalProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const reset = () => {
    setStep('phone');
    setPhone('');
    setCode('');
    setConfirmation(null);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSendOtp = async () => {
    if (!isValidIndianMobile(phone)) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    setError('');
    setSending(true);
    try {
      const result = await sendPhoneOtp(phone, RECAPTCHA_CONTAINER_ID);
      setConfirmation(result);
      setStep('otp');
    } catch (err) {
      resetRecaptcha();
      setError(
        err instanceof Error && err.message.includes('too-many-requests')
          ? 'Too many attempts. Please try again later.'
          : 'Could not send OTP. Please check the number and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation) return;
    if (code.trim().length < 4) {
      setError('Enter the OTP');
      return;
    }
    setError('');
    setVerifying(true);
    try {
      await confirmPhoneOtp(confirmation, code.trim());
      // onAuthStateChanged (AuthProvider) picks up the new session and
      // creates the Firestore profile — this modal just needs to close.
      handleClose();
    } catch {
      setError('Incorrect OTP. Try again.');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} maxWidthClassName="max-w-[420px]">
      <div className="p-8">
        <div className="mb-[6px] flex items-center justify-between">
          <div className="font-display text-[22px] font-extrabold">Login</div>
          <ModalCloseButton onClick={handleClose} />
        </div>
        <p className="mb-6 text-sm text-muted">{message || 'Enter your phone number to continue'}</p>

        {step === 'phone' && (
          <div>
            <label className="mb-[6px] block text-[11px] font-extrabold tracking-[0.1em] text-[#a8a29e]">
              PHONE NUMBER
            </label>
            <div className="mb-[14px] flex gap-[10px]">
              <div className="whitespace-nowrap rounded-xl border-[1.5px] border-border bg-[#f5f4f2] px-[14px] py-[10px] text-sm font-semibold text-ink">
                +91
              </div>
              <input
                type="tel"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                className="flex-1 rounded-xl border-[1.5px] border-border px-[14px] py-[10px] text-sm text-ink outline-none"
              />
            </div>
            <div className="mb-[10px] min-h-[18px] text-[12.5px] text-red-600">{error}</div>
            <Button variant="brand" className="w-full py-[13px] text-[15px]" onClick={handleSendOtp} disabled={sending}>
              {sending ? 'Sending…' : 'Send OTP'}
            </Button>
          </div>
        )}

        {step === 'otp' && (
          <div>
            <div className="mb-5 text-center">
              <div className="mb-2 text-[32px]">📱</div>
              <div className="mb-1 text-[15px] font-bold">
                OTP sent to <span>+91 {phone}</span>
              </div>
              <div className="text-[13px] text-muted">Enter the code below</div>
            </div>
            <label className="mb-[6px] block text-[11px] font-extrabold tracking-[0.1em] text-[#a8a29e]">
              ENTER OTP
            </label>
            <input
              type="tel"
              maxLength={6}
              placeholder="Enter OTP"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
              className="mb-[10px] w-full rounded-xl border-[1.5px] border-border px-[14px] py-3 text-center text-xl font-extrabold tracking-[8px] text-ink outline-none"
            />
            <div className="mb-[10px] min-h-[18px] text-[12.5px] text-red-600">{error}</div>
            <Button
              variant="brand"
              className="mb-[10px] w-full py-[13px] text-[15px]"
              onClick={handleVerifyOtp}
              disabled={verifying}
            >
              {verifying ? 'Verifying…' : 'Verify OTP'}
            </Button>
            <Button variant="outline" className="w-full py-[10px] text-sm text-muted" onClick={() => setStep('phone')}>
              ← Change Number
            </Button>
            <div className="mt-[14px] text-center text-xs text-muted">
              Didn&apos;t receive OTP?{' '}
              <button type="button" onClick={handleSendOtp} className="font-bold text-brand">
                Resend
              </button>
            </div>
          </div>
        )}

        {/* Firebase's invisible reCAPTCHA renders into this container — required before signInWithPhoneNumber will send an SMS. */}
        <div id={RECAPTCHA_CONTAINER_ID} />
      </div>
    </Modal>
  );
}
