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
  pricePerSeat: number;
  badge?: string;
};

const DURATION_OPTIONS: DurationOption[] = [
  { months: 1,  label: '1 Month',   pricePerSeat: 21 },
  { months: 3,  label: '3 Months',  pricePerSeat: 54,  badge: 'Save 14%' },
  { months: 6,  label: '6 Months',  pricePerSeat: 90,  badge: 'Save 29%' },
  { months: 12, label: '1 Year',    pricePerSeat: 144, badge: 'Best Value' },
];

export default function SubscriptionView({ user, role, onSuccess, onLogout }: SubscriptionViewProps) {
  const { t } = useI18n();
  const [loading,      setLoading]      = useState(false);
  const [verifying,    setVerifying]    = useState(false);
  const [seatCount,    setSeatCount]    = useState(1);
  const [seatInput,    setSeatInput]    = useState('1');
  const [duration,     setDuration]     = useState<DurationOption>(DURATION_OPTIONS[0]!);
  const [promoCode,    setPromoCode]    = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discountPct: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);

  const premiumRole: PremiumRole = role === 'manufacturer' ? 'manufacturer' : 'retailer';
  const isRetailer = premiumRole === 'retailer';

  const content = {
    badge:    isRetailer ? t('retailerPremiumBadge')    : t('manufacturerPremiumBadge'),
    title:    isRetailer ? t('retailerPremiumTitle')    : t('manufacturerPremiumTitle'),
    subtitle: isRetailer ? t('retailerPremiumSubtitle') : t('manufacturerPremiumSubtitle'),
    benefits: isRetailer
      ? [t('retailerBenefit1'), t('retailerBenefit2'), t('retailerBenefit3'), t('retailerBenefit4')]
      : [t('manufacturerBenefit1'), t('manufacturerBenefit2'), t('manufacturerBenefit3'), t('manufacturerBenefit4')],
  };

  const baseTotal   = seatCount * duration.pricePerSeat;
  const discountAmt = promoApplied ? Math.floor(baseTotal * promoApplied.discountPct / 100) : 0;
  const finalTotal  = baseTotal - discountAmt;

  const handleSeatInput = (val: string) => {
    setSeatInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1 && n <= 10000) setSeatCount(n);
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
        description: `${seatCount} listing${seatCount !== 1 ? 's' : ''} · ${duration.label}`,
        order_id: order.id,
        handler: async function (paymentResponse: any) {
          setVerifying(true);
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:  paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature:  paymentResponse.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || verifyData.status !== 'ok') {
              throw new Error('Payment verification failed. Please contact support.');
            }
            const updateResult = await updateSubscriptionStatus(user.uid, 'paid', {
              orderId:   paymentResponse.razorpay_order_id,
              paymentId: paymentResponse.razorpay_payment_id,
            }, verifyData.seatCount || seatCount, duration.months);

            if (!updateResult.paymentLogged) {
              setVerifying(false);
              setLoading(false);
              setError(
                'Payment received, but your listing count could not be updated. ' +
                'Please refresh the page or contact support with your payment ID: ' +
                paymentResponse.razorpay_payment_id
              );
              return;
            }

            getUserProfile(user.uid).then((profile) => {
              const profileEmail = profile?.email ?? '';
              if (!profileEmail || profileEmail.includes('@krishidukan.local')) return;
              const now = new Date();
              const expiry = new Date(now);
              expiry.setMonth(expiry.getMonth() + duration.months);
              fetch('/api/email/subscription-confirmation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userEmail:         profileEmail,
                  userName:          profile?.name || user.displayName || '',
                  seatsPurchased:    verifyData.seatCount || seatCount,
                  amountPaid:        finalTotal,
                  planName:          'Standard',
                  startDate:         now.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  expiryDate:        expiry.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpayOrderId:   paymentResponse.razorpay_order_id,
                }),
              }).catch(() => {});
            }).catch(() => {});

            await onSuccess();
          } catch (err: any) {
            setError(err.message || 'Payment completed but profile update failed. Please refresh.');
          } finally {
            setVerifying(false);
            setLoading(false);
          }
        },
        modal:   { ondismiss: () => setLoading(false) },
        prefill: { name: user.displayName || '', email: user.email || '' },
        theme:   { color: '#154212' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => { setLoading(false); setError('Payment was not completed. Please try again.'); });
      rzp.open();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // ── Benefit icons ────────────────────────────────────────────────────────────
  const benefitIcons = isRetailer
    ? ['🌾', '💬', '📍', '🏪']
    : ['🏭', '📦', '🤝', '📈'];

  return (
    <>
      {/* Verifying overlay */}
      {verifying && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4" />
          <p className="font-bold text-primary text-base">{t('verifyingPayment')}</p>
          <p className="text-on-surface-variant text-sm mt-1 font-medium">{t('settingUpAccount')}</p>
        </div>
      )}

      <div className="min-h-[calc(100vh-64px)] flex items-start md:items-center justify-center px-4 md:px-6 py-6 md:py-10 bg-gradient-to-b from-green-50/60 to-surface-container-lowest">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl"
        >
          {/* ── Hero headline ─────────────────────────────────────────────── */}
          <div className="text-center mb-6 md:mb-8 px-2">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full mb-3">
              <ICONS.Trust className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">{content.badge}</span>
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-on-surface leading-tight mb-2">
              {isRetailer ? (
                <>आपले कृषी दुकान<br className="md:hidden" /> <span className="text-primary">आता ऑनलाइन</span> 🌾</>
              ) : (
                <>आपले उत्पादने थेट<br className="md:hidden" /> <span className="text-primary">विक्रेत्यांपर्यंत</span> 🏭</>
              )}
            </h1>
            <p className="text-sm md:text-base text-on-surface-variant font-medium max-w-md mx-auto">
              {content.subtitle}
            </p>
            {/* Trust bar */}
            <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5 mt-4">
              {[
                { icon: '✅', text: '20+ retailers joined' },
                { icon: '🧑‍🌾', text: 'Farmers searching daily' },
                { icon: '🔒', text: 'Secure · Razorpay' },
              ].map(({ icon, text }) => (
                <span key={text} className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant bg-white border border-outline-variant/30 px-3 py-1.5 rounded-full shadow-sm">
                  <span>{icon}</span>{text}
                </span>
              ))}
            </div>
          </div>

          {/* ── Main card ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-[1.5rem] shadow-ambient border border-surface-container overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-green-400 to-primary opacity-60 pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-2">

              {/* ── Left: Benefits + previews ───────────────────────────── */}
              <div className="p-6 md:p-8 border-b lg:border-b-0 lg:border-r border-outline-variant/20 flex flex-col gap-6">

                {/* Benefits */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">{t('includedBenefits')}</p>
                  <ul className="space-y-3">
                    {content.benefits.map((benefit, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="text-lg leading-none mt-0.5 shrink-0">{benefitIcons[i]}</span>
                        <span className="text-sm font-medium text-on-surface leading-snug">{benefit}</span>
                      </li>
                    ))}
                    <li className="flex items-start gap-3 bg-primary/5 border border-primary/15 rounded-xl p-3 mt-1">
                      <span className="text-lg leading-none mt-0.5 shrink-0">🛒</span>
                      <span className="text-sm font-bold text-primary leading-snug">
                        {t('listUpTo', { seats: seatCount })} · {duration.label}
                      </span>
                    </li>
                  </ul>
                </div>

                {/* WhatsApp inquiry preview */}
                {isRetailer && (
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                      Example Farmer Inquiry
                    </p>
                    <div className="bg-[#e5ddd5] rounded-2xl p-4 shadow-inner">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-full bg-green-700 flex items-center justify-center shrink-0">
                          <span className="text-white text-sm font-bold">S</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800">Suresh Patil</p>
                          <p className="text-[10px] text-gray-500">🧑‍🌾 Farmer · Karjat Village</p>
                        </div>
                      </div>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm max-w-[85%]">
                        <p className="text-xs text-gray-800 leading-relaxed">नमस्कार! NPK 12:32:16 खत available आहे का? किंमत सांगा 🙏</p>
                        <p className="text-[9px] text-gray-400 text-right mt-1">11:42 AM ✓✓</p>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-2 text-center font-medium">
                        आजच list करा — आजच inquiry मिळवा
                      </p>
                    </div>
                  </div>
                )}

                {/* Product listing preview */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                    Your listing will look like this
                  </p>
                  <div className="border border-outline-variant/40 rounded-2xl p-4 bg-surface-container-lowest shadow-sm">
                    <div className="flex gap-3 items-center">
                      <div className="w-16 h-16 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0 text-3xl">
                        🌱
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-on-surface truncate">
                              {isRetailer ? 'NPK Fertilizer 50kg' : 'Krishi Plus NPK 50kg'}
                            </p>
                            <p className="text-[11px] text-on-surface-variant mt-0.5">
                              {isRetailer ? 'Available at your store' : 'Distributed to 20+ retailers'}
                            </p>
                            <p className="text-base font-black text-primary mt-1">₹850</p>
                          </div>
                        </div>
                      </div>
                      <button className="shrink-0 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-3 py-2 rounded-xl flex flex-col items-center gap-0.5 shadow-sm transition-colors">
                        <span className="text-base leading-none">💬</span>
                        <span>Inquiry</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-outline-variant/20">
                      <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Verified Retailer</span>
                      <span className="text-[10px] text-on-surface-variant">Karjat, Maharashtra</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Right: Payment config ────────────────────────────────── */}
              <div className="p-6 md:p-8 flex flex-col gap-5">

                {/* Duration selector */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2.5">Duration</p>
                  <div className="grid grid-cols-2 gap-2">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.months}
                        type="button"
                        onClick={() => setDuration(opt)}
                        className={[
                          'relative flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                          duration.months === opt.months
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-outline-variant/40 hover:border-primary/40 hover:bg-surface-container-lowest',
                        ].join(' ')}
                      >
                        {opt.badge && (
                          <span className={`absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider ${opt.badge === 'Best Value' ? 'bg-amber-500' : 'bg-primary'}`}>
                            {opt.badge}
                          </span>
                        )}
                        <span className="text-xs font-bold text-on-surface">{opt.label}</span>
                        <span className="text-[10px] text-on-surface-variant mt-0.5">₹{opt.pricePerSeat}/listing</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Listing count stepper */}
                <div className="flex justify-between items-center bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/40">
                  <div>
                    <p className="text-sm font-bold text-on-surface">{t('numberOfSeats')}</p>
                    <p className="text-[10px] text-on-surface-variant mt-0.5">आजच 1 listing ने सुरुवात करा</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white rounded-xl p-1 border border-outline-variant/20 shadow-sm">
                    <button
                      onClick={() => adjustSeats(-1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container transition-colors text-on-surface font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={seatInput}
                      onChange={(e) => handleSeatInput(e.target.value)}
                      className="text-base font-black w-12 text-center bg-transparent h-8 text-on-surface outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => adjustSeats(1)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-container transition-colors text-on-surface font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Promo code */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">Promo Code</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(null); setPromoError(null); }}
                      className="flex-1 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5 text-xs font-medium text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 uppercase placeholder:normal-case"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={promoLoading || !promoCode.trim()}
                      className="rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
                    >
                      {promoLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                  {promoApplied && (
                    <p className="mt-1.5 text-xs font-semibold text-primary">✓ {promoApplied.discountPct}% discount applied</p>
                  )}
                  {promoError && <p className="mt-1.5 text-xs text-red-600">{promoError}</p>}
                </div>

                {/* Price summary */}
                <div className="bg-gradient-to-br from-primary/5 to-green-50 rounded-xl border border-primary/10 p-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{t('totalPrice')}</span>
                    {promoApplied && (
                      <span className="text-xs text-on-surface-variant line-through">₹{baseTotal}.00</span>
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-black text-on-surface tracking-tight">₹{finalTotal}.00</span>
                    <span className="text-[10px] text-on-surface-variant bg-white border border-outline-variant/20 rounded-lg px-2 py-1 font-semibold">
                      ₹{duration.pricePerSeat} × {seatCount} listing{seatCount !== 1 ? 's' : ''} · {duration.label}
                    </span>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 text-xs font-medium flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    {error}
                  </div>
                )}

                {/* CTA */}
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/25 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-70 disabled:hover:translate-y-0 text-sm tracking-wide"
                >
                  {loading
                    ? t('processing')
                    : seatCount === 1
                      ? `आजच List करा — ₹${finalTotal} · ${duration.label}`
                      : `List ${seatCount} Products for ₹${finalTotal} · ${duration.label}`
                  }
                </button>

                <div className="flex flex-col items-center gap-2">
                  <p className="text-[10px] text-on-surface-variant font-semibold flex items-center gap-1.5 opacity-70">
                    <ICONS.Trust className="w-3 h-3" />
                    {t('securePayment')}
                  </p>
                  <button
                    onClick={onLogout}
                    className="text-[11px] text-on-surface-variant font-medium hover:text-primary transition-colors hover:underline"
                  >
                    {t('logoutGoBack')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
