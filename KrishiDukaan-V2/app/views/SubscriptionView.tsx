'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ICONS } from '../constants';
import { getUserProfile, updateSubscriptionStatus } from '../firebase';
import { useI18n } from '../i18n/I18nContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface SubscriptionViewProps {
  user: any;
  role: 'customer' | 'retailer' | 'manufacturer';
  onSuccess: () => void;
  onLogout: () => void;
}

declare global {
  interface Window { Razorpay: any; }
}

type PremiumRole = 'retailer' | 'manufacturer';

type DurationOption = {
  months: number;
  label: string;
  pricePerSeat: number; // total per seat for the entire duration
  badge?: string;
};

const DURATION_OPTIONS: DurationOption[] = [
  { months: 1,  label: '1 Month',   pricePerSeat: 21 },
  { months: 3,  label: '3 Months',  pricePerSeat: 54,  badge: 'Save 14%' },
  { months: 6,  label: '6 Months',  pricePerSeat: 90,  badge: 'Save 29%' },
  { months: 12, label: '1 Year',    pricePerSeat: 144, badge: 'Best value' },
];

export default function SubscriptionView({ user, role, onSuccess, onLogout }: SubscriptionViewProps) {
  const { t } = useI18n();
  const [loading,   setLoading]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [seatCount, setSeatCount] = useState(1);
  const [seatInput, setSeatInput] = useState('1');
  const [duration,  setDuration]  = useState<DurationOption>(DURATION_OPTIONS[0]!);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountPct: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const premiumRole: PremiumRole = role === 'manufacturer' ? 'manufacturer' : 'retailer';

  const content = {
    badge: premiumRole === 'retailer' ? t('retailerPremiumBadge') : t('manufacturerPremiumBadge'),
    title: premiumRole === 'retailer' ? t('retailerPremiumTitle') : t('manufacturerPremiumTitle'),
    subtitle: premiumRole === 'retailer' ? t('retailerPremiumSubtitle') : t('manufacturerPremiumSubtitle'),
    benefits: premiumRole === 'retailer' ? [
      t('retailerBenefit1'), t('retailerBenefit2'), t('retailerBenefit3'), t('retailerBenefit4')
    ] : [
      t('manufacturerBenefit1'), t('manufacturerBenefit2'), t('manufacturerBenefit3'), t('manufacturerBenefit4')
    ],
  };

  const accent = premiumRole === 'manufacturer' ? 'text-secondary' : 'text-primary';

  const baseTotal    = seatCount * duration.pricePerSeat;
  const discountAmt  = promoApplied ? Math.floor(baseTotal * promoApplied.discountPct / 100) : 0;
  const finalTotal   = baseTotal - discountAmt;

  const handleSeatInput = (val: string) => {
    setSeatInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 10000) {
      setSeatCount(n);
    }
  };

  const adjustSeats = (delta: number) => {
    const next = Math.max(1, seatCount + delta);
    setSeatCount(next);
    setSeatInput(String(next));
  };

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const q = query(collection(db, 'promoCodes'), where('code', '==', code), where('active', '==', true));
      const snap = await getDocs(q);
      if (snap.empty) {
        setPromoError('Invalid or expired promo code.');
        setPromoApplied(null);
      } else {
        const data = snap.docs[0]!.data() as any;
        const discountPct: number = typeof data.discountPercent === 'number' ? data.discountPercent : 0;
        if (!discountPct) {
          setPromoError('This promo code has no active discount.');
          setPromoApplied(null);
        } else {
          setPromoApplied({ code, discountPct });
          setPromoError(null);
        }
      }
    } catch {
      setPromoError('Could not validate promo code. Try again.');
    } finally {
      setPromoLoading(false);
    }
  };

  const handlePayment = async () => {
    setLoading(true);
    setError(null);
    try {
      if (typeof window === 'undefined' || !window.Razorpay) {
        throw new Error('Payment gateway is not ready. Please refresh and try again.');
      }

      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seatCount,
          durationMonths: duration.months,
          promoCode: promoApplied?.code ?? null,
          userId: user.uid,
        }),
      });

      if (!response.ok) throw new Error('Unable to start payment right now. Please try again.');
      const order = await response.json();
      if (order.error) throw new Error(order.error);

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: 'KrishiDukan',
        description: `${seatCount} seat${seatCount !== 1 ? 's' : ''} · ${duration.label}`,
        order_id: order.id,
        handler: async function (paymentResponse: any) {
          setVerifying(true);
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || verifyData.status !== 'ok') {
              throw new Error('Payment verification failed. Please contact support.');
            }
            const updateResult = await updateSubscriptionStatus(user.uid, 'paid', {
              orderId: paymentResponse.razorpay_order_id,
              paymentId: paymentResponse.razorpay_payment_id,
            }, verifyData.seatCount || seatCount, duration.months);

            if (!updateResult.paymentLogged && updateResult.paymentLogError) {
              console.warn('Non-blocking payment log error:', updateResult.paymentLogError);
            }

            // Fire-and-forget subscription confirmation email
            if (user.email) {
              const now = new Date();
              const expiry = new Date(now);
              expiry.setMonth(expiry.getMonth() + duration.months);
              fetch('/api/email/subscription-confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userEmail: user.email,
                  userName: user.displayName || '',
                  seatsPurchased: verifyData.seatCount || seatCount,
                  amountPaid: finalTotal,
                  planName: 'Standard',
                  startDate: now.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  expiryDate: expiry.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                }),
              }).catch(() => {/* email failure is non-fatal */});
            }

            await onSuccess();
          } catch (err: any) {
            const latestProfile = await getUserProfile(user.uid);
            if (latestProfile?.isPaid) { await onSuccess(); return; }
            setError(err.message || 'Payment completed but profile update failed. Please refresh.');
          } finally {
            setVerifying(false);
            setLoading(false);
          }
        },
        modal: { ondismiss: () => setLoading(false) },
        prefill: { name: user.displayName || '', email: user.email || '' },
        theme: { color: '#154212' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => { setLoading(false); setError('Payment was not completed. Please try again.'); });
      rzp.open();
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      {verifying && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4" />
          <p className="font-bold text-primary text-base">{t('verifyingPayment')}</p>
          <p className="text-on-surface-variant text-sm mt-1 font-medium">{t('settingUpAccount')}</p>
        </div>
      )}
      <div className="min-h-[calc(100vh-64px)] flex items-start md:items-center justify-center px-4 md:px-6 py-4 md:py-8 bg-surface-container-lowest">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-5 md:p-6 lg:p-8 rounded-[1.5rem] shadow-ambient w-full max-w-4xl max-h-[calc(100vh-100px)] md:max-h-none overflow-y-auto border border-surface-container relative"
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent pointer-events-none rounded-t-[1.5rem]" />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 relative z-10">
            {/* Left: Branding & Benefits */}
            <div className="flex flex-col text-left justify-center pt-1">
              <div className="w-12 h-12 bg-white border border-primary/20 rounded-xl flex items-center justify-center mb-3 md:mb-4 shadow-md shadow-primary/5">
                <ICONS.Star className="w-6 h-6 text-primary" />
              </div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3 w-fit">
                <ICONS.Trust className={`w-3.5 h-3.5 ${accent}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>{content.badge}</span>
              </div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-on-surface mb-2 tracking-tight">{content.title}</h1>
              <p className="text-xs md:text-sm text-on-surface-variant mb-4 md:mb-6 font-medium leading-relaxed max-w-sm">{content.subtitle}</p>
              <div className="bg-primary/[0.02] border border-primary/5 rounded-xl p-4 md:p-5 shadow-sm">
                <h3 className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-3 ${accent}`}>{t('includedBenefits')}</h3>
                <ul className="space-y-2.5 md:space-y-3">
                  {content.benefits.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs md:text-sm font-medium text-on-surface leading-snug">
                      <div className="mt-0.5 w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                        <ICONS.Check className={`w-2.5 h-2.5 md:w-3 md:h-3 ${accent}`} />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                  <li className="flex items-start gap-2.5 text-xs md:text-sm font-medium text-on-surface leading-snug bg-white/50 p-1.5 -mx-1.5 rounded-lg border border-primary/5">
                    <div className="mt-0.5 w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/20">
                      <ICONS.Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                    </div>
                    <span className="font-bold text-primary">{t('listUpTo', { seats: seatCount })} · {duration.label}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right: Payment & Configuration */}
            <div className="flex flex-col">
              <div className="bg-white rounded-2xl p-5 md:p-6 border border-outline-variant shadow-md shadow-black/[0.02] flex-1 flex flex-col justify-between h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />

                <div className="relative z-10 flex flex-col gap-4">
                  <div className="flex justify-between items-center pb-3 border-b border-outline-variant/30">
                    <span className="text-on-surface-variant font-bold uppercase tracking-widest text-[10px]">{t('plan')}</span>
                    <span className={`px-2 py-0.5 rounded bg-primary/5 font-black uppercase tracking-widest text-[9px] ${accent}`}>{content.badge}</span>
                  </div>

                  {/* Duration selector */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Duration</p>
                    <div className="grid grid-cols-2 gap-2">
                      {DURATION_OPTIONS.map((opt) => (
                        <button
                          key={opt.months}
                          type="button"
                          onClick={() => setDuration(opt)}
                          className={[
                            'relative flex flex-col items-start p-2.5 rounded-xl border text-left transition-all',
                            duration.months === opt.months
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-outline-variant/40 hover:border-primary/40',
                          ].join(' ')}
                        >
                          {opt.badge && (
                            <span className="absolute -top-2 right-2 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider">
                              {opt.badge}
                            </span>
                          )}
                          <span className="text-xs font-bold text-on-surface">{opt.label}</span>
                          <span className="text-[10px] text-on-surface-variant">₹{opt.pricePerSeat}/seat</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Seat count — manual input + stepper */}
                  <div className="flex justify-between items-center bg-surface-container-lowest p-3 md:p-4 rounded-xl border border-outline-variant/40 shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-on-surface font-bold text-xs md:text-sm mb-0.5">{t('numberOfSeats')}</span>
                      <span className="text-on-surface-variant text-[10px]">{t('listUpTo', { seats: seatCount })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-surface-container-low rounded-lg p-1 border border-outline-variant/20">
                      <button onClick={() => adjustSeats(-1)}
                        className="w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm transition-all text-on-surface text-sm">
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={seatInput}
                        onChange={(e) => handleSeatInput(e.target.value)}
                        className="text-sm md:text-base font-black w-14 md:w-16 text-center bg-white rounded-md h-7 md:h-8 shadow-sm text-on-surface border border-outline-variant/10 outline-none focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button onClick={() => adjustSeats(1)}
                        className="w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center hover:bg-white hover:shadow-sm transition-all text-on-surface text-sm">
                        +
                      </button>
                    </div>
                  </div>

                  {/* Promo code */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Promo code</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(null); setPromoError(null); }}
                        className="flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-xs font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 uppercase placeholder:normal-case"
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        disabled={promoLoading || !promoCode.trim()}
                        className="rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                      >
                        {promoLoading ? '…' : 'Apply'}
                      </button>
                    </div>
                    {promoApplied && (
                      <p className="mt-1 text-xs font-semibold text-primary">
                        ✓ {promoApplied.discountPct}% discount applied
                      </p>
                    )}
                    {promoError && <p className="mt-1 text-xs text-red-600">{promoError}</p>}
                  </div>

                  {/* Pricing breakdown */}
                  <div className="flex justify-between items-end bg-gradient-to-br from-primary/[0.01] to-primary/[0.03] p-4 md:p-5 rounded-xl border border-primary/5 shadow-inner">
                    <div>
                      <span className="text-on-surface-variant font-bold uppercase tracking-widest text-[10px] block mb-1">{t('totalPrice')}</span>
                      {promoApplied && (
                        <span className="text-xs text-on-surface-variant line-through block">₹{baseTotal}.00</span>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-2xl md:text-3xl font-black text-on-surface mb-0.5 tracking-tight">₹{finalTotal}.00</span>
                      <span className="px-1.5 py-0.5 bg-primary/5 text-primary rounded text-[9px] font-bold uppercase tracking-widest border border-primary/10">
                        ₹{duration.pricePerSeat} · {seatCount} seat{seatCount !== 1 ? 's' : ''} · {duration.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 mt-4">
                  {error && (
                    <div className="mb-3 bg-red-50 text-red-700 p-3 rounded-lg border border-red-100 text-[11px] font-medium flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">⚠️</div>
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className="w-full bg-primary text-white text-[11px] md:text-xs font-black uppercase tracking-widest py-3 md:py-3.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:shadow-primary/10 transition-all disabled:opacity-70 disabled:hover:translate-y-0"
                  >
                    {loading ? t('processing') : `Pay ₹${finalTotal} · ${seatCount} seat${seatCount !== 1 ? 's' : ''} · {duration.label}`}
                  </button>
                  <div className="mt-4 flex flex-col items-center gap-3">
                    <p className="text-[9px] md:text-[10px] text-on-surface-variant font-bold uppercase tracking-widest flex items-center gap-1 opacity-70">
                      <ICONS.Trust className="w-3 h-3" />
                      {t('securePayment')}
                    </p>
                    <button onClick={onLogout}
                      className="text-on-surface-variant font-bold text-[10px] md:text-xs hover:text-primary transition-colors hover:underline">
                      {t('logoutGoBack')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
