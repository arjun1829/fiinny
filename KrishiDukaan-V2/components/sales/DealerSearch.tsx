import { Search, X } from 'lucide-react';

interface DealerSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DealerSearch({ value, onChange }: DealerSearchProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name, shop or phone…"
        className="w-full rounded-xl border border-outline/25 bg-white py-2.5 pl-10 pr-10 text-sm text-on-surface placeholder-outline focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {value ? (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
