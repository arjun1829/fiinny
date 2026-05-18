import { useEffect, useLayoutEffect, useState } from "react";
import { ICONS } from "../constants";
import { Tractor, Store, Factory, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, saveUserProfile } from "../firebase";
import { useI18n } from "../i18n/I18nContext";
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "retailer" | "manufacturer">("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<SignupInviteDetails | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const trimmedInvite = inviteCode?.trim() || "";

  useLayoutEffect(() => {
    if (!trimmedInvite) {
      setInviteDetails(null);
      setInviteLoading(false);
      return;
    }
    setInviteDetails(null);
    setInviteLoading(true);
  }, [trimmedInvite]);

  useEffect(() => {
    if (!trimmedInvite) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const details = await fetchInviteDetailsForSignup(trimmedInvite);
        if (!cancelled) setInviteDetails(details);
      } catch (e) {
        if (!cancelled) {
          setInviteDetails({
            found: false,
            claimable: false,
            inviteCode: trimmedInvite,
            status: "",
            retailerEmail: "",
            retailerId: "",
            manufacturerId: "",
            manufacturerName: null,
          });
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trimmedInvite]);

  /** While loading invite or when invite is claimable, signup is retailer-only for this link. */
  const inviteRetailerOnly = Boolean(
    trimmedInvite && (inviteLoading || inviteDetails?.claimable === true),
  );

  useEffect(() => {
    if (inviteDetails?.claimable) setRole("retailer");
  }, [inviteDetails?.claimable]);

  const manufacturerLabel =
    inviteDetails?.manufacturerName?.trim() || "this manufacturer";

  const normalizePhone = (value: string) => value.replace(/\D/g, "");

  const customerAuthEmailFromPhone = (value: string) => {
    const normalized = normalizePhone(value);
    return `customer.${normalized}@krishidukan.local`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (trimmedInvite && inviteDetails?.claimable === true && role !== "retailer") {
      setError(
        "This invite is for retailer accounts only. You cannot sign up as a manufacturer with this link.",
      );
      setLoading(false);
      return;
    }

    const effectiveRole: "customer" | "retailer" | "manufacturer" = inviteRetailerOnly ? "retailer" : role;

    const normalizedPhone = normalizePhone(phone);

    let authEmail = email.trim().toLowerCase();
    let profileEmail = authEmail;
    if (effectiveRole === "customer") {
      if (normalizedPhone.length < 10) {
        setError("Please enter a valid mobile number.");
        setLoading(false);
        return;
      }
      authEmail = customerAuthEmailFromPhone(normalizedPhone);
      profileEmail = authEmail;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
      const user = userCredential.user;

      const profile = {
        name,
        email: profileEmail,
        role: effectiveRole,
        phone: normalizedPhone,
        authEmail,
        phoneNormalized: normalizedPhone,
      };
      await saveUserProfile(user.uid, profile);

      if (trimmedInvite && inviteDetails?.claimable) {
        const result = await acceptManufacturerInvite({
          uid: user.uid,
          inviteCode: trimmedInvite,
        });
        if (result.ok === false) {
          setError(
            `${result.message} Your retailer account was created, but the invite could not be linked automatically.`,
          );
        }
      }

      onInviteConsumed?.();
      onSuccess(user, profile);
    } catch (err: unknown) {
      console.error("Signup error:", err);
      const msg = err instanceof Error ? err.message : "Failed to create account. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-surface-container bg-white p-8 shadow-ambient"
      >
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/images/krishidukan icon.webp" 
            alt="KrishiDukan" 
            className="w-20 h-20 object-contain mb-2"
          />
          <span className="font-black text-2xl text-primary">
            Krishi<span className="text-secondary">Dukan</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 font-bold text-primary transition-transform hover:translate-x-1"
        >
          <ICONS.ChevronRight className="h-4 w-4 rotate-180" /> {t("backToStore")}
        </button>

        <h1 className="mb-2 text-3xl font-bold text-on-surface">{t("createAccountTitle")}</h1>
        <p className="mb-8 font-medium text-on-surface-variant">{t("signupSubtitle")}</p>

        {trimmedInvite ? (
          <div className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
            {inviteLoading ? (
              <p className="font-medium text-on-surface-variant">Loading invite…</p>
            ) : inviteDetails?.claimable ? (
              <>
                <p className="font-bold text-primary">Manufacturer invite</p>
                <p className="mt-2 text-on-surface">
                  You are invited by{" "}
                  <span className="font-semibold text-primary">{manufacturerLabel}</span> to join as a
                  retailer.
                </p>
                <p className="mt-2 text-xs text-on-surface-variant">
                  Your account type must be <strong>retailer</strong> for this invite.
                </p>
              </>
            ) : inviteDetails && !inviteDetails.found ? (
              <p className="text-harvest">
                We could not find this invite link. You can still sign up; it will not be linked to a
                manufacturer.
              </p>
            ) : (
              <p className="text-harvest">
                {inviteDetails?.status === "revoked"
                  ? "This invite is no longer valid (revoked)."
                  : inviteDetails?.status === "active"
                    ? "This invite has already been used."
                    : "This invite cannot be used anymore."}
              </p>
            )}
          </div>
        ) : null}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {!inviteRetailerOnly && (
            <div className="mb-2">
              <p className="mb-3 ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                I am a…
              </p>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      value: "customer" as const,
                      icon: Tractor,
                      label: "Farmer",
                      sub: "Buy products online",
                      color: "text-green-600",
                      bg: "bg-green-50",
                      activeBg: "bg-green-600",
                    },
                    {
                      value: "retailer" as const,
                      icon: Store,
                      label: "Retailer",
                      sub: "Run an agri shop",
                      color: "text-blue-600",
                      bg: "bg-blue-50",
                      activeBg: "bg-blue-600",
                    },
                    {
                      value: "manufacturer" as const,
                      icon: Factory,
                      label: "Manufacturer",
                      sub: "Supply & distribute",
                      color: "text-orange-600",
                      bg: "bg-orange-50",
                      activeBg: "bg-orange-600",
                    },
                  ] as const
                ).map(({ value, icon: Icon, label, sub, color, bg, activeBg }) => {
                  const active = role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={loading}
                      onClick={() => setRole(value)}
                      className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 text-center transition-all disabled:opacity-50 ${
                        active
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-outline-variant/40 bg-surface-container-low hover:border-outline-variant hover:bg-surface-container"
                      }`}
                    >
                      {active && (
                        <CheckCircle2 className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                      )}
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                          active ? `${activeBg} text-white` : `${bg} ${color}`
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span
                          className={`text-xs font-black leading-tight ${
                            active ? "text-primary" : "text-on-surface"
                          }`}
                        >
                          {label}
                        </span>
                        <span className="text-[10px] leading-tight text-on-surface-variant">
                          {sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
              {t("fullName")}
            </label>
            <input
              type="text"
              required
              disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>

          <div className="space-y-2">
            {role === "customer" && (
              <>
                <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  required
                  disabled={loading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                />
              </>
            )}
          </div>

          {role !== "customer" && (
            <div className="space-y-2">
            <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
              {t("emailAddress")}
            </label>
            <input
              type="email"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
            </div>
          )}

          <div className="space-y-2">
            <label className="ml-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">
              {t("password")}
            </label>
            <input
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-4 text-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading || (Boolean(trimmedInvite) && inviteLoading)}
            className="mt-4 w-full rounded-2xl bg-primary py-4 font-black uppercase tracking-widest text-white shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:scale-100 disabled:opacity-70"
          >
            {loading ? t("creatingAccount") : t("createAccount")}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm font-medium text-on-surface-variant">
            {t("alreadyHaveAccount")}
            <button
              type="button"
              onClick={onNavigateToLogin}
              className="ml-1 font-bold text-primary hover:underline"
            >
              {t("signIn")}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
