import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const countries = [
    { code: "in", name: "India", flag: "🇮🇳", currency: "INR" },
    { code: "us", name: "United States", flag: "🇺🇸", currency: "USD" },
    { code: "gb", name: "United Kingdom", flag: "🇬🇧", currency: "GBP" },
    { code: "sg", name: "Singapore", flag: "🇸🇬", currency: "SGD" },
    { code: "au", name: "Australia", flag: "🇦🇺", currency: "AUD" },
    { code: "ca", name: "Canada", flag: "🇨🇦", currency: "CAD" },
    { code: "jp", name: "Japan", flag: "🇯🇵", currency: "JPY" },
    { code: "eu", name: "Europe", flag: "🇪🇺", currency: "EUR" },
];

export default function CountriesPage() {
    return (
        <div className="min-h-screen bg-slate-50 py-20 px-4">
            <div className="max-w-4xl mx-auto">
                <Link href="/" className="inline-flex items-center text-slate-500 hover:text-teal-600 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-slate-900 mb-4">Supported Countries</h1>
                <p className="text-xl text-slate-600 mb-12">Fiinny works globally. Select your region to see specific features.</p>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {countries.map((country) => (
                        <Link
                            key={country.code}
                            href={`/countries/${country.code}`}
                            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-teal-200 transition-all group"
                        >
                            <div className="text-4xl mb-4">{country.flag}</div>
                            <h3 className="text-xl font-bold text-slate-900 group-hover:text-teal-600 transition-colors">{country.name}</h3>
                            <p className="text-slate-500 mt-2">Currency: {country.currency}</p>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
