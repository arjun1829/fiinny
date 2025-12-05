import { motion } from "framer-motion";
import { Phone, ArrowRight, Shield } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { createUserProfile } from "@/lib/firestore";
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

export default function LoginScreen() {
    const [phoneNumber, setPhoneNumber] = useState<string>("+91");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState<"phone" | "otp">("phone");
    const [loading, setLoading] = useState(false);
    const [confirmationResult, setConfirmationResult] = useState<any>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Initialize reCAPTCHA on mount if not already done
        if (!(window as any).recaptchaVerifier) {
            try {
                (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                    size: 'invisible',
                    callback: () => {
                        console.log("reCAPTCHA solved");
                    },
                    'expired-callback': () => {
                        console.log("reCAPTCHA expired");
                        // Reset reCAPTCHA
                        if ((window as any).recaptchaVerifier) {
                            (window as any).recaptchaVerifier.clear();
                            (window as any).recaptchaVerifier = null;
                        }
                    }
                });
            } catch (error) {
                console.error("Error initializing reCAPTCHA:", error);
            }
        }

        // Cleanup on unmount
        return () => {
            if ((window as any).recaptchaVerifier) {
                try {
                    (window as any).recaptchaVerifier.clear();
                } catch (e) {
                    console.error("Error clearing reCAPTCHA:", e);
                }
                (window as any).recaptchaVerifier = null;
            }
        };
    }, []);

    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!phoneNumber || phoneNumber.length < 10) {
            alert("Please enter a valid phone number");
            return;
        }

        setLoading(true);

        try {
            const appVerifier = (window as any).recaptchaVerifier;
            if (!appVerifier) {
                throw new Error("reCAPTCHA not initialized. Please refresh the page.");
            }

            const confirmation = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
            setConfirmationResult(confirmation);
            setStep("otp");
            alert("OTP sent successfully! Check your phone.");
        } catch (error: any) {
            console.error("Error sending OTP:", error);

            if (error.code === 'auth/invalid-phone-number') {
                alert("Invalid phone number format. Please check and try again.");
            } else if (error.code === 'auth/too-many-requests') {
                alert("Too many requests. Please try again later.");
            } else if (error.code === 'auth/invalid-app-credential') {
                alert("App verification failed.\n\n1. Ensure 'localhost' is in Firebase Console > Auth > Settings > Authorized Domains.\n2. Try using a Test Phone Number (Firebase Console > Auth > Sign-in method > Phone > Phone numbers for testing).");
            } else {
                alert(`Failed to send OTP: ${error.message || 'Unknown error'}`);
            }

            // Do NOT clear reCAPTCHA here immediately, as it might be needed for retry
            // But if it failed, we might need to reset it.
            if ((window as any).recaptchaVerifier) {
                // Often best to just let the user retry or refresh
            }
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const result = await confirmationResult.confirm(otp);
            const user = result.user;

            // Create user profile in Firestore if new user
            await createUserProfile(user.uid, {
                phoneNumber: user.phoneNumber,
                displayName: user.displayName || "User",
            });

            window.location.href = "/dashboard";
        } catch (error) {
            console.error("Error verifying OTP:", error);
            alert("Invalid OTP. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
            <div id="recaptcha-container"></div>

            {/* Background Elements */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12 max-w-md w-full relative z-10"
            >
                {/* Logo */}
                <Link href="/" className="flex flex-col items-center justify-center mb-8">
                    <div className="w-12 h-12 bg-teal-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg shadow-teal-200">
                        F
                    </div>
                    <span className="text-2xl font-bold text-slate-900">Fiinny</span>
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h1>
                    <p className="text-slate-500">Sign in to access your dashboard</p>
                </div>

                {step === "phone" ? (
                    <form onSubmit={handleSendOTP} className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                                <Phone className="w-4 h-4" />
                                <span>Phone Number</span>
                            </label>
                            <PhoneInput
                                international
                                defaultCountry="IN"
                                value={phoneNumber}
                                onChange={(value) => setPhoneNumber(value || "+91")}
                                className="phone-input w-full px-4 py-3 rounded-xl border border-slate-200 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition bg-slate-50"
                            />
                            <p className="text-xs text-slate-400 mt-2">Default: India (+91)</p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={loading}
                            className="w-full bg-teal-600 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-teal-200 hover:bg-teal-700 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span>{loading ? "Sending..." : "Send OTP"}</span>
                            {!loading && <ArrowRight className="w-5 h-5" />}
                        </motion.button>

                        <div className="flex items-center justify-center space-x-2 text-sm text-slate-400">
                            <Shield className="w-4 h-4" />
                            <span>Secured with Firebase Auth</span>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleVerifyOTP} className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Enter OTP
                            </label>
                            <input
                                type="text"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                placeholder="123456"
                                maxLength={6}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition text-center text-2xl font-bold tracking-widest bg-slate-50 text-slate-900"
                            />
                            <p className="text-xs text-slate-500 mt-2 text-center">We sent a code to {phoneNumber}</p>
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            disabled={loading}
                            className="w-full bg-teal-600 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-teal-200 hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Verifying..." : "Verify & Sign In"}
                        </motion.button>

                        <button
                            type="button"
                            onClick={() => setStep("phone")}
                            className="w-full text-teal-600 hover:text-teal-700 transition text-sm font-medium"
                        >
                            ← Change phone number
                        </button>
                    </form>
                )}

                <div className="mt-8 text-center text-sm text-slate-400">
                    <p>
                        By signing in, you agree to our{" "}
                        <Link href="/terms" className="text-teal-600 hover:underline">Terms</Link>
                        {" "}and{" "}
                        <Link href="/privacy" className="text-teal-600 hover:underline">Privacy Policy</Link>
                    </p>
                </div>
            </motion.div>

            <style jsx global>{`
        .phone-input input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 12px;
          border: none;
          background: transparent;
          font-size: 16px;
          color: #0f172a;
        }
        .phone-input input:focus {
          outline: none;
        }
        .PhoneInputCountry {
          margin-right: 12px;
          opacity: 0.7;
        }
      `}</style>
        </div>
    );
}
