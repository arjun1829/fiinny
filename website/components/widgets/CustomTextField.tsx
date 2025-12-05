import { InputHTMLAttributes, forwardRef } from "react";
import { LucideIcon } from "lucide-react";

interface CustomTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    icon?: LucideIcon;
    error?: string;
}

const CustomTextField = forwardRef<HTMLInputElement, CustomTextFieldProps>(
    ({ label, icon: Icon, error, className = "", ...props }, ref) => {
        return (
            <div className="w-full">
                {label && (
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                        {Icon && <Icon className="w-4 h-4" />}
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={`w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all ${error ? "border-red-500 focus:ring-red-500/20 focus:border-red-500" : ""
                        } ${className}`}
                    {...props}
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>
        );
    }
);

CustomTextField.displayName = "CustomTextField";
export default CustomTextField;
