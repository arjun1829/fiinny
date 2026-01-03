"use client";

interface InstrumentFiltersProps {
    selectedInstrument: "all" | "upi" | "debit" | "others";
    onInstrumentChange: (instrument: "all" | "upi" | "debit" | "others") => void;
}

export default function InstrumentFilters({
    selectedInstrument,
    onInstrumentChange
}: InstrumentFiltersProps) {
    const instruments: Array<{ value: "all" | "upi" | "debit" | "others"; label: string }> = [
        { value: "all", label: "All" },
        { value: "upi", label: "UPI" },
        { value: "debit", label: "Debit Card" },
        { value: "others", label: "Others" },
    ];

    return (
        <div className="flex flex-wrap gap-2">
            {instruments.map((instrument) => (
                <button
                    key={instrument.value}
                    onClick={() => onInstrumentChange(instrument.value)}
                    className={`
                        px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        ${selectedInstrument === instrument.value
                            ? "bg-slate-900 text-white shadow-md"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }
                    `}
                >
                    {instrument.label}
                </button>
            ))}
        </div>
    );
}
