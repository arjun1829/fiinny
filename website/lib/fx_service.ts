export class FxService {
    private static instance: FxService;
    private baseUrl = 'https://api.frankfurter.app';
    private rates: Record<string, number> = {
        'USD': 1.0,
        'EUR': 0.92,
        'GBP': 0.79,
        'INR': 84.0,
        // Fallbacks
    };
    private lastFetch: number = 0;
    private STORAGE_KEY = 'fiinny_fx_rates';
    private TIMESTAMP_KEY = 'fiinny_fx_timestamp';

    private constructor() { }

    static getInstance(): FxService {
        if (!FxService.instance) {
            FxService.instance = new FxService();
        }
        return FxService.instance;
    }

    async init(): Promise<void> {
        this.loadFromCache();
        if (this.shouldFetch()) {
            await this.fetchRates();
        }
    }

    private loadFromCache() {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            const ts = localStorage.getItem(this.TIMESTAMP_KEY);
            if (stored && ts) {
                this.rates = JSON.parse(stored);
                // Ensure Base USD is present
                this.rates['USD'] = 1.0;
                this.lastFetch = parseInt(ts, 10);
            }
        } catch (e) {
            console.error('FxService cache load failed', e);
        }
    }

    private shouldFetch(): boolean {
        const now = Date.now();
        // 24 hours
        return (now - this.lastFetch) > (24 * 60 * 60 * 1000);
    }

    private async fetchRates(): Promise<void> {
        try {
            const res = await fetch(`${this.baseUrl}/latest?from=USD`);
            if (res.ok) {
                const data = await res.json();
                this.rates = data.rates;
                this.rates['USD'] = 1.0; // Base
                this.lastFetch = Date.now();

                if (typeof window !== 'undefined') {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.rates));
                    localStorage.setItem(this.TIMESTAMP_KEY, this.lastFetch.toString());
                }
                console.log('FxService: Rates updated');
            }
        } catch (e) {
            console.error('FxService fetch failed', e);
        }
    }

    getRate(from: string, to: string): number {
        if (from === to) return 1.0;
        const fromRate = this.rates[from.toUpperCase()] || 0;
        const toRate = this.rates[to.toUpperCase()] || 0;

        if (fromRate === 0 || toRate === 0) {
            // console.warn(`FxService: Missing rate for ${from} or ${to}`);
            return 1.0; // Fallback
        }

        // Amount(USD) = Amount(From) / Rate(From)
        // Amount(To) = Amount(USD) * Rate(To)
        return (1.0 / fromRate) * toRate;
    }

    convert(amount: number, from: string, to: string): number {
        if (from === to) return amount;
        return amount * this.getRate(from, to);
    }
}
