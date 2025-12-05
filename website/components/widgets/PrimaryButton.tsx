import { ButtonHTMLAttributes } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    loading?: boolean;
    variant?: "primary" | "secondary" | "danger" | "ghost";
    icon?: React.ReactNode;
}

export default function PrimaryButton({
    children,
    loading,
    variant = "primary",
    icon,
    className = "",
    disabled,
    ...props
}: PrimaryButtonProps) {
    const baseStyles = "px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-teal-600 text-white hover:bg-teal-700 shadow-lg shadow-teal-500/20",
        secondary: "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100",
        danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100",
        ghost: "bg-transparent text-slate-600 hover:bg-slate-50"
    };

    return (
        <motion.button
            whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
            whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
            className={`${baseStyles} ${variants[variant]} ${className}`}
            disabled={disabled || loading}
            {...(props as any)}
        >
            {loading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading...</span>
                </>
            ) : (
                <>
                    {icon}
                    {children}
                </>
            )}
        </motion.button>
    );
}
