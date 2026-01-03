"use client";

interface ScopeFiltersProps {
    selectedScope: "all" | "savings" | "credit";
    onScopeChange: (scope: "all" | "savings" | "credit") => void;
}

export default function ScopeFilters({ selectedScope, onScopeChange }: ScopeFiltersProps) {
    const scopes: Array<{ value: "all" | "savings" | "credit"; label: string }> = [
        { value: "all", label: "All" },
        { value: "savings", label: "Savings accounts" },
        { value: "credit", label: "Credit cards" },
    ];

    return (
        <div className="flex flex-wrap gap-2">
            {scopes.map((scope) => (
                <button
                    key={scope.value}
                    onClick={() => onScopeChange(scope.value)}
                    className={`
                        px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        ${selectedScope === scope.value
                            ? "bg-slate-900 text-white shadow-md"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }
                    `}
                >
                    {scope.label}
                </button>
            ))}
        </div>
    );
}
