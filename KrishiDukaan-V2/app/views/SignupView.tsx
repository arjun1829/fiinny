import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ICONS } from "../constants";
import { Tractor, Store, Factory, CheckCircle2, Phone } from "lucide-react";
import { motion } from "framer-motion";
import {
  signInWithPhoneNumber,
  RecaptchaVerifier,
  type ConfirmationResult,
} from "firebase/auth";
import { auth, saveUserProfile } from "../firebase";
import { useI18n } from "../i18n/I18nContext";
import { HelperIcon, HelperTooltip } from "../../components/helpers";
import { acceptManufacturerInvite } from "../lib/invite/invite-acceptance-service";
import {
  fetchInviteDetailsForSignup,
  type SignupInviteDetails,
} from "../lib/invite/fetch-invite-for-signup";

interface SignupViewProps {
  inviteCode?: string | null;
  onInviteConsumed?: () => void;
  onBack: () => void;
  onNavigateToLogin: () => void;
  onSuccess: (user: any, profile: any) => void;
}

export default function SignupView({
  inviteCode,
  onInviteConsumed,
  onBack,
  onNavigateToLogin,
  onSuccess,
}: SignupViewProps) {
  const { t } = useI18n();

  // Shared state
  const [name, setName] = useState("");
  const [role, setRole] = useState<"customer" | "retailer" | "manufacturer">("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<SignupInviteDetails | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Phone OTP state
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [otp, setOtp] = useState("");
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    let div = document.getElementById('recaptcha-container-signup-global');
    if (!div) {
      div = document.createElement('div');
      div.id = 'recaptcha-container-signup-global';
      document.body.appendChild(div);
    }
    const verifier = new RecaptchaVerifier(auth, div, { size: 'invisible' });
    recaptchaRef.current = verifier;
    return () => {
      try { verifier.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
    };
  }, []);

  const trimmedInvite = inviteCode?.trim() || "";

  useLayoutEffect(() => {
    if (!trimmedInvite) { setInviteDetails(null); setInviteLoading(false); return; }
    setInviteDetails(null);
    setInviteLoading(true);
  }, [trimmedInvite]);

  useEffect(() => {
    if (!trimmedInvite) return;
    let cancelled = false;
    void (async () => {
      try {
        const details = await fetchInviteDetailsForSignup(trimmedInvite);
        if (!cancelled) setInviteDetails(details);
      } catch {
        if (!cancelled) {
          setInviteDetails({
            found: false, claimable: false, inviteCode: trimmedInvite,
            status: "", retailerEmail: "", retailerPhone: "", retailerId: "",
            retailerShopName: null, manufacturerId: "", manufacturerName: null,
          });
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [trimmedInvite]);

  const inviteRetailerOnly = Boolean(
    trimmedInvite &&
    (
      inviteLoading ||
      inviteDetails?.claimable === true ||
      inviteDetails?.status === "active"
    ),
  );

  useEffect(() => {
    if (inviteDetails?.claimable || inviteDetails?.status === "active") setRole("retailer");
    // Auto-fill phone from invite so the retailer can't sign up with a different number
    if (inviteDetails?.claimable && inviteDetails.retailerPhone) {
      const digits = inviteDetails.retailerPhone.replace(/\D/g, "");
      const tenDigit = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
      setPhone(tenDigit || inviteDetails.retailerPhone);
    }
  }, [inviteDetails?.claimable, inviteDetails?.status, inviteDetails?.retailerPhone]);

  const manufacturerLabel = inviteDetails?.manufacturerName?.trim() || "this manufacturer";

  const normalizePhone = (value: string) => value.replace(/\D/g, "");

  const toE164 = (digits: string) => {
    if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`;
  };

  const effectiveRole = inviteRetailerOnly ? "retailer" : role;

  // ── Shared invite acceptance ────────────────────────────────────────────────

  const acceptInviteIfNeeded = async (uid: string, profile: any) => {
    if (!trimmedInvite) return;
    const result = await acceptManufacturerInvite({ uid, inviteCode: trimmedInvite });
    if (result.ok === false) {
      setError(`${result.message} Your account was created, but the invite could not be linked automatically.`);
    } else {
      profile.isPaid = true;
    }
  };

  // ── Phone OTP handlers ──────────────────────────────────────────────────────

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (inviteRetailerOnly && role !== "retailer") {
      setError("This invite is for retailer accounts only. Please select the Retailer account type.");
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 10) { setError("Please enter a valid 10-digit mobile number."); return; }
    setLoading(true);
    try {
      if (!recaptchaRef.current) {
        throw new Error("reCAPTCHA not ready. Please refresh and try again.");
      }
      const result = await signInWithPhoneNumber(auth, toE164(normalizedPhone), recaptchaRef.current);
      confirmationRef.current = result;
      setStep("otp");
    } catch (err: unknown) {
      console.error("[OTP Send Error]", (err as any)?.code, (err as any)?.message, err);
      const code = (err as any)?.code ?? "";
      if (code.includes("recaptcha") || code.includes("captcha") || code.includes("app-not-authorized")) {
        setError("Could not send OTP. Please check your internet connection and try again.");
      } else if (code === "auth/invalid-phone-number") {
        setError("Please enter a valid 10-digit mobile number.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError("Could not send OTP. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationRef.current) {
      setError("OTP session expired. Please go back and resend the OTP.");
      return;
    }
    setError(null);
    setLoading(true);
    const normalizedPhone = normalizePhone(phone);
    const profileEmail = `${normalizedPhone}@krishidukan.local`;
    try {
      const result = await confirmationRef.current.confirm(otp.trim());
      const user = result.user;
      const profile = {
        name,
        email: profileEmail,
        role: effectiveRole,
        phone: normalizedPhone,
        phoneNormalized: normalizedPhone,
      };
      await saveUserProfile(user.uid, profile);
      await acceptInviteIfNeeded(user.uid, profile);
      onInviteConsumed?.();
      onSuccess(user, profile);
    } catch (err: unknown) {
      const code = (err as any)?.code ?? "";
      if (code === "auth/invalid-verification-code") {
        setError("Incorrect OTP. Please check and try again.");
      } else if (code === "auth/code-expired") {
        setError("OTP expired. Please go back and request a new one.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a few minutes and try again.");
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Shared role picker ───────────────────────────────────────────────────────

  const rolePicker = (
    <div className="mb-2">
      <div className="mb-3 ml-1 flex items-center gap-1.5">
        <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">I am a…</p>
        <HelperIcon
          size="xs"
          variant="ghost"
          side="right"
          textKey="signupRole"
          ariaLabel="Role selection help"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {([
          { value: "customer" as const, icon: Tractor, label: "Farmer", sub: "Buy products online", activeBg: "bg-green-600", helperKey: "signupRoleFarmer" as const },
          { value: "retailer" as const, icon: Store, label: "Retailer", sub: "Run an agri shop", activeBg: "bg-blue-600", helperKey: "signupRoleRetailer" as const },
          { value: "manufacturer" as const, icon: Factory, label: "Manufacturer", sub: "Supply & distribute", activeBg: "bg-orange-600", helperKey: "signupRoleManufacturer" as const },
        ]).map(({ value, icon: Icon, label, sub, activeBg, helperKey }) => {
          const active = role === value;
          return (
            <HelperTooltip key={value} side="bottom" textKey={helperKey}>
              <button
                type="button"
                disabled={loading}
                onClick={() => setRole(value)}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 text-center transition-all disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-outline-variant/40 bg-surface-container-low hover:border-outline-variant hover:bg-surface-container"
                }`}
              >
                {active && <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />}
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${active ? `${activeBg} text-white` : "bg-surface-container text-on-surface-variant"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={`text-xs font-black leading-tight ${active ? "text-primary" : "text-on-surface"}`}>{label}</span>
                  <span className="text-[10px] leading-tight text-on-surface-variant">{sub}</span>
                </span>
              </button>
            </HelperTooltip>
          );
        })}
      </div>
    </div>
  );

  const inputCls =
    "w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-surface-container bg-white p-8 shadow-ambient"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/images/krishidukan icon.webp" alt="KrishiDukan" className="w-20 h-20 object-contain mb-2" />
          <span className="font-black text-2xl text-primary">Krishi<span className="text-secondary">Dukan</span></span>
        </div>

        {!trimmedInvite && (
          <button
            type="button"
            onClick={onBack}
            className="mb-6 flex items-center gap-2 font-bold text-primary transition-transform hover:translate-x-1"
          >
            <ICONS.ChevronRight className="h-4 w-4 rotate-180" /> {t("backToStore")}
          </button>
        )}

        {/* Invite banner — replaces generic heading when a valid invite is present */}
        {trimmedInvite ? (
          <div className="mb-6">
            {inviteLoading ? (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-on-surface-variant">Loading invite…</p>
              </div>
            ) : inviteDetails?.claimable ? (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <p className="text-xl font-black text-on-surface mb-1">Welcome to Krishi Dukan!</p>
                {inviteDetails.retailerShopName && (
                  <p className="text-lg font-bold text-primary mb-3">Welcome, {inviteDetails.retailerShopName}!</p>
                )}
                <p className="text-sm text-on-surface-variant">
                  Your business has been invited by{' '}
                  <span className="font-semibold text-primary">{manufacturerLabel}</span>
                  {' '}to join Krishi Dukan. Complete your account setup to start managing your products and orders.
                </p>
              </div>
            ) : inviteDetails && !inviteDetails.found ? (
              <div className="rounded-2xl border border-harvest/30 bg-harvest/5 p-4">
                <p className="text-sm text-harvest">We could not find this invite link. You can still sign up; it will not be linked to a manufacturer.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-harvest/30 bg-harvest/5 p-4">
                <p className="text-sm text-harvest">
                  {inviteDetails?.status === "revoked"
                    ? "This invite is no longer valid (revoked)."
                    : inviteDetails?.status === "active"
                      ? "This invite link was already activated. If this is your shop, continue with the same mobile number or sign in to your retailer account."
                      : "This invite cannot be used anymore."}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-3xl font-bold text-on-surface">{t("createAccountTitle")}</h1>
            <p className="mb-6 font-medium text-on-surface-variant">{t("signupSubtitle")}</p>
          </>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}


        {/* ── Phone OTP flow ── */}
        {step === "details" ? (
          <form onSubmit={handleSendOtp} className="space-y-5">
            {!inviteRetailerOnly && rolePicker}

            <div className="space-y-2">
              <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">{t("fullName")}</label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <div className="ml-1 flex items-center gap-1.5">
                <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Mobile Number</label>
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="signupMobile"
                  ariaLabel="Mobile number help"
                />
              </div>
              <div className={`flex items-center gap-2 rounded-2xl border px-5 py-4 ${inviteDetails?.claimable && inviteDetails.retailerPhone ? "border-primary/30 bg-primary/5" : "border-outline-variant bg-surface-container-low"}`}>
                <span className="text-sm font-bold text-on-surface-variant">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  disabled={loading}
                  readOnly={Boolean(inviteDetails?.claimable && inviteDetails.retailerPhone)}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-on-surface"
                />
                {inviteDetails?.claimable && inviteDetails.retailerPhone && (
                  <span className="text-xs font-semibold text-primary shrink-0">Invite</span>
                )}
              </div>
              {inviteDetails?.claimable && inviteDetails.retailerPhone ? (
                <p className="ml-1 text-xs text-on-surface-variant">
                  Your mobile number was pre-registered by your manufacturer and cannot be changed.
                </p>
              ) : phone.length > 0 && phone.length < 10 ? (
                <p className="ml-1 text-xs text-red-600">Enter exactly 10 digits ({phone.length}/10)</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading || (Boolean(trimmedInvite) && inviteLoading)}
              className="mt-4 w-full rounded-2xl bg-primary py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-70"
            >
              {loading ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div className="space-y-2">
              <div className="ml-1 flex items-center gap-1.5">
                <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Enter OTP</label>
                <HelperIcon
                  size="xs"
                  variant="ghost"
                  side="right"
                  textKey="signupOtp"
                  ariaLabel="OTP help"
                />
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                disabled={loading}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-center text-lg font-bold tracking-widest transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                autoFocus
              />
              <p className="ml-1 text-xs text-on-surface-variant">OTP sent to +91 {normalizePhone(phone)}</p>
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="mt-4 w-full rounded-2xl bg-primary py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-70"
            >
              {loading ? t("creatingAccount") : "Verify & Create Account"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("details"); setOtp(""); setError(null); }}
              className="w-full text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
            >
              Change number / Resend OTP
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <p className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-on-surface-variant">
            <span>
              {t("alreadyHaveAccount")}
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="ml-1 font-bold text-primary hover:underline"
              >
                {t("signIn")}
              </button>
            </span>
            <HelperIcon
              size="xs"
              variant="ghost"
              side="top"
              textKey="signupExistingUser"
              ariaLabel="New vs existing user help"
            />
          </p>
        </div>
      </motion.div>
    </div>
  );
}
