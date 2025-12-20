import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

// This would ideally come from a shared config or API
const countryData: Record<string, any> = {
    in: { name: "India", flag: "🇮🇳", currency: "INR", features: ["UPI Integration", "SMS Parsing", "Bank Sync"] },
    us: { name: "United States", flag: "🇺🇸", currency: "USD", features: ["Plaid Integration", "Credit Score", "IRS Tax Prep"] },
    gb: { name: "United Kingdom", flag: "🇬🇧", currency: "GBP", features: ["Open Banking", "HMRC Sync", "ISA Tracking"] },
    default: { name: "Global", flag: "🌍", currency: "USD", features: ["Manual Tracking", "Multi-currency", "Global Analytics"] },
};

export async function generateStaticParams() {
    return Object.keys(countryData).map((code) => ({
        code: code,
    }));
}


import { use } from "react";

export default function CountryDetail({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const codeLower = code.toLowerCase();
    const data = countryData[codeLower] || countryData.default;

    return (
        <div className="min-h-screen bg-slate-50 py-20 px-4">
            <div className="max-w-3xl mx-auto">
                <Link href="/countries" className="inline-flex items-center text-slate-500 hover:text-teal-600 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Countries
                </Link>

                <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-100">
                    <div className="flex items-center gap-4 mb-8">
                        <span className="text-6xl">{data.flag}</span>
                        <div>
                            <h1 className="text-4xl font-bold text-slate-900">{data.name}</h1>
                            <p className="text-slate-500 text-lg">Fiinny for {data.name}</p>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4">Local Features</h3>
                            <ul className="space-y-3">
                                {data.features.map((feature: string, i: number) => (
                                    <li key={i} className="flex items-center gap-3 text-slate-700">
                                        <CheckCircle2 className="w-5 h-5 text-teal-500" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <h4 className="font-bold text-slate-900 mb-2">Currency Support</h4>
                            <p className="text-slate-600">
                                Fiinny automatically detects <strong>{data.currency}</strong> and formats all your analytics accordingly.
                            </p>
                        </div>

                        <div className="pt-8 border-t border-slate-100">
                            <Link
                                href="/login"
                                className="block w-full py-4 bg-slate-900 text-white text-center rounded-xl font-bold hover:bg-slate-800 transition-colors"
                            >
                                Get Started in {data.name}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
