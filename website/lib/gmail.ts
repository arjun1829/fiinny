import { GoogleAuthProvider, signInWithPopup, linkWithPopup, User } from "firebase/auth";
import { auth, db } from "./firebase";
import { collection, doc, setDoc, getDoc, Timestamp, arrayUnion, increment } from "firebase/firestore";
import { SubscriptionDetector } from "./subscription_detector";
import { SmartParser } from "./smart_parser";

// --- Types ---

interface DetectedBank {
    code?: string;
    display?: string;
    tier: 'major' | 'other' | 'unknown';
}

interface BankProfile {
    code: string;
    display: string;
    domains: string[];
    headerHints: string[];
}

interface BillInfo {
    totalDue?: number;
    minDue?: number;
    dueDate?: Date;
    statementStart?: Date;
    statementEnd?: Date;
}

// --- Constants ---

const MAJOR_BANKS: BankProfile[] = [
    { code: 'SBI', display: 'State Bank of India', domains: ['sbi.co.in'], headerHints: ['state bank of india', 'sbi'] },
    { code: 'HDFC', display: 'HDFC Bank', domains: ['hdfcbank.com'], headerHints: ['hdfc bank', 'hdfc'] },
    { code: 'ICICI', display: 'ICICI Bank', domains: ['icicibank.com'], headerHints: ['icici bank', 'icici'] },
    { code: 'AXIS', display: 'Axis Bank', domains: ['axisbank.com'], headerHints: ['axis bank', 'axis'] },
    { code: 'KOTAK', display: 'Kotak Mahindra Bank', domains: ['kotak.com'], headerHints: ['kotak mahindra bank', 'kotak'] },
    // Add more as needed from the original list
];

const EMAIL_WHITELIST = new Set([
    'bobfinancial.com', 'amex.com', 'mastercard.com', 'visacards.com', 'rupay.co.in',
    'razorpay.com', 'billdesk.com', 'cashfree.com', 'paytm.com', 'phonepe.com'
]);

// --- Gmail Service Class ---

export class GmailService {
    private static instance: GmailService;
    private accessToken: string | null = null;

    private constructor() { }

    public static getInstance(): GmailService {
        if (!GmailService.instance) {
            GmailService.instance = new GmailService();
            GmailService.instance.loadToken();
        }
        return GmailService.instance;
    }

    private loadToken() {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('gmail_access_token');
            const expiry = localStorage.getItem('gmail_token_expiry');
            if (stored && expiry) {
                if (Date.now() < parseInt(expiry)) {
                    this.accessToken = stored;
                    console.log("Restored Gmail connection from storage");
                } else {
                    console.log("Gmail token expired");
                    localStorage.removeItem('gmail_access_token');
                    localStorage.removeItem('gmail_token_expiry');
                }
            }
        }
    }

    private saveToken(token: string, expiresInSeconds: number = 3500) {
        if (typeof window !== 'undefined') {
            this.accessToken = token;
            localStorage.setItem('gmail_access_token', token);
            localStorage.setItem('gmail_token_expiry', (Date.now() + expiresInSeconds * 1000).toString());
        }
    }

    // --- Authentication ---

    public async connect(): Promise<boolean> {
        try {
            const provider = new GoogleAuthProvider();
            provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

            // Force account selection to ensure we get the right account and consent
            provider.setCustomParameters({
                prompt: 'consent select_account'
            });

            let result;
            if (auth.currentUser) {
                // Link to existing user (e.g. Phone Auth user)
                result = await linkWithPopup(auth.currentUser, provider);
            } else {
                // Fallback if no user (shouldn't happen in this flow)
                result = await signInWithPopup(auth, provider);
            }

            const credential = GoogleAuthProvider.credentialFromResult(result);

            if (credential?.accessToken) {
                this.saveToken(credential.accessToken);
                return true;
            }
            return false;
        } catch (error: any) {
            console.error("Error connecting Gmail:", error);
            if (error.code === 'auth/credential-already-in-use') {
                alert("This Gmail is already linked to another account.");
            }
            return false;
        }
    }

    // --- Main Fetch Logic ---

    public async fetchAndStoreTransactions(userId: string, newerThanDays: number = 30): Promise<number> {
        if (!this.accessToken) {
            console.warn("No access token. Call connect() first.");
            return 0;
        }

        const since = new Date();
        since.setDate(since.getDate() - newerThanDays);
        const newerDays = Math.floor((Date.now() - since.getTime()) / (1000 * 60 * 60 * 24));

        const query = `(bank OR card OR transaction OR credited OR debited OR purchase OR spent OR withdrawn OR payment OR UPI OR refund OR salary OR invoice OR receipt OR statement OR bill) newer_than:${newerDays}d -in:spam -in:trash -category:promotions`;

        let pageToken: string | undefined = undefined;
        let processedCount = 0;

        try {
            do {
                const listUrl: string = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`;
                const listResp = await fetch(listUrl, {
                    headers: { Authorization: `Bearer ${this.accessToken}` }
                });

                if (listResp.status === 401) {
                    console.error("Gmail Token Expired or Invalid (401). Clearing storage.");
                    this.accessToken = null;
                    localStorage.removeItem('gmail_access_token');
                    throw new Error("Auth Token Expired. Please reconnect Gmail.");
                }

                if (!listResp.ok) throw new Error(`Gmail API error: ${listResp.statusText}`);

                const listData = await listResp.json();
                const messages = listData.messages || [];

                if (messages.length === 0) break;

                // Process in batches
                await Promise.all(messages.map(async (msg: any) => {
                    try {
                        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`;
                        const detailResp = await fetch(detailUrl, {
                            headers: { Authorization: `Bearer ${this.accessToken}` }
                        });
                        const messageDetails = await detailResp.json();

                        const ingestedDate = await this._handleMessage(userId, messageDetails);
                        if (ingestedDate) processedCount++;
                    } catch (e) {
                        console.error(`Error processing message ${msg.id}:`, e);
                    }
                }));

                pageToken = listData.nextPageToken;
            } while (pageToken && processedCount < 200); // Safety cap

            return processedCount;

        } catch (error) {
            console.error("Fetch loop error:", error);
            return processedCount;
        }
    }

    // --- Parsing & Handling ---

    private async _handleMessage(userId: string, msg: any): Promise<Date | null> {
        const headers = msg.payload?.headers;
        const subject = this._getHeader(headers, 'subject') || '';
        const bodyText = this._extractPlainText(msg.payload) || msg.snippet || '';
        const combined = (subject + '\n' + bodyText).trim();

        if (!combined) return null;

        const emailDomain = this._fromDomain(headers);
        const detectedBank = this._detectBank(headers, combined);

        // Gate checks
        const looksTxn = this._passesTxnGate(combined, emailDomain, detectedBank);
        const passesIncomeGate = this._emailTxnGateForIncome(combined, emailDomain, detectedBank);

        if (!looksTxn && !passesIncomeGate) return null;

        // Extraction
        const direction = this._inferDirection(combined);
        const amount = this._extractTxnAmount(combined, direction);

        if (!direction || !amount || amount <= 0) return null;

        const msgDate = new Date(parseInt(msg.internalDate || Date.now().toString()));
        const bank = detectedBank.code || this._guessBankFromHeaders(headers) || this._guessIssuerBankFromBody(combined);

        // Basic deduplication key
        const txKey = `web_${bank || 'UNK'}_${amount}_${msgDate.getTime()}_${direction}`;

        // Check if exists (simple check)
        const docId = `ing_${this._hashString(txKey)}`;
        const col = direction === 'debit' ? 'expenses' : 'incomes';
        const docRef = doc(db, 'users', userId, col, docId);

        const existing = await getDoc(docRef);
        if (existing.exists()) return null;

        // Prepare data
        const note = this._cleanNoteSimple(combined);
        const instrument = this._inferInstrument(combined);
        const cardLast4 = this._extractCardLast4(combined);
        const upiVpa = this._extractUpiVpa(combined);
        // Extraction via SmartParser
        const merchantInfo = SmartParser.extractMerchant(combined, direction || 'debit');
        const merchant = merchantInfo?.name || (upiVpa ? upiVpa.toUpperCase() : 'UNKNOWN');

        // Categorization
        const categoryInfo = SmartParser.categorize(combined, merchant);

        // [NEW] Subscription & Hidden Charge Analysis
        const analysis = SubscriptionDetector.analyzeTransaction(combined);

        const data = {
            id: docId,
            type: direction === 'debit' ? 'Email Debit' : 'Email Credit',
            amount: amount,
            note: note,
            date: Timestamp.fromDate(msgDate),
            payerId: userId,
            issuerBank: bank,
            instrument: instrument,
            upiVpa: upiVpa,

            // Smart Fields
            counterparty: merchant,
            counterpartyType: merchantInfo?.type || 'MERCHANT',
            category: categoryInfo.category,
            subcategory: categoryInfo.subcategory,
            tags: arrayUnion(...categoryInfo.tags),

            source: 'Email',
            ingestSources: arrayUnion('gmail'),
            // New Fields
            isSubscription: analysis.isSubscription,
            isHiddenCharge: analysis.isHiddenCharge,
            subscriptionName: analysis.subscriptionName || null,
            sourceRecord: {
                gmail: {
                    gmailId: msg.id,
                    snippet: msg.snippet,
                    when: Timestamp.now()
                }
            }
        };

        if (analysis.isHiddenCharge) {
            console.warn(`⚠️ Hidden charge detected in email from ${emailDomain}: ${note}`);
        }

        await setDoc(docRef, data, { merge: true });
        return msgDate;
    }

    // --- Helpers (Ported from Dart) ---

    private _getHeader(headers: any[], name: string): string | null {
        if (!headers) return null;
        return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || null;
    }

    private _extractPlainText(payload: any): string | null {
        if (!payload) return null;

        const decode = (data: string) => {
            try {
                return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
            } catch (e) { return null; }
        };

        if (payload.mimeType === 'text/plain' && payload.body?.data) {
            return decode(payload.body.data);
        }

        if (payload.parts) {
            for (const part of payload.parts) {
                const text = this._extractPlainText(part);
                if (text) return text;
            }
        }
        return null;
    }

    private _detectBank(headers: any[], body: string): DetectedBank {
        const domain = this._fromDomain(headers)?.toLowerCase();
        const fromHdr = (this._getHeader(headers, 'from') || '').toLowerCase();
        const subject = (this._getHeader(headers, 'subject') || '').toLowerCase();
        const all = `${fromHdr} ${subject} ${body}`.toLowerCase();

        for (const b of MAJOR_BANKS) {
            if (domain && b.domains.some(d => domain.endsWith(d))) {
                return { code: b.code, display: b.display, tier: 'major' };
            }
            if (b.headerHints.some(h => all.includes(h))) {
                return { code: b.code, display: b.display, tier: 'major' };
            }
        }
        return { tier: 'unknown' };
    }

    private _fromDomain(headers: any[]): string | null {
        const from = this._getHeader(headers, 'from') || '';
        const match = from.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
        return match ? match[1].toLowerCase() : null;
    }

    private _passesTxnGate(text: string, domain: string | null, bank: DetectedBank): boolean {
        const hasCurrency = /₹|inr|rs\.?/i.test(text);
        const hasVerb = /\b(debited|credited|spent|paid|purchase|charged|withdrawn)\b/i.test(text);

        if (!hasCurrency || !hasVerb) return false;

        const isMajor = bank.tier === 'major';
        const isGateway = domain && EMAIL_WHITELIST.has(domain);

        if (isMajor || isGateway) return true;

        // Stricter for others
        const hasRef = /\b(utr|ref|txn|account)\b/i.test(text);
        return hasRef;
    }

    private _emailTxnGateForIncome(text: string, domain: string | null, bank: DetectedBank): boolean {
        const hasCurrency = /₹|inr|rs\.?/i.test(text);
        const strongCredit = /\b(credited|received|salary|payout)\b/i.test(text);

        if (!hasCurrency || !strongCredit) return false;
        return true;
    }

    private _inferDirection(text: string): 'debit' | 'credit' | null {
        const lower = text.toLowerCase();
        const debit = /\b(debited|spent|paid|purchase|withdrawn)\b/i.test(lower);
        const credit = /\b(credited|received|salary|refund)\b/i.test(lower);

        if (debit && !credit) return 'debit';
        if (credit && !debit) return 'credit';
        return null;
    }

    private _extractTxnAmount(text: string, direction: string | null): number | null {
        // Regex to find amounts like Rs. 1,234.50 or INR 500
        const regex = /(?:₹|INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const val = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(val) && val > 0) return val;
        }
        return null;
    }

    private _guessBankFromHeaders(headers: any[]): string | null {
        const from = (this._getHeader(headers, 'from') || '').toLowerCase();
        if (from.includes('hdfc')) return 'HDFC';
        if (from.includes('sbi')) return 'SBI';
        if (from.includes('icici')) return 'ICICI';
        if (from.includes('axis')) return 'AXIS';
        return null;
    }

    private _guessIssuerBankFromBody(body: string): string | null {
        const upper = body.toUpperCase();
        if (upper.includes('HDFC')) return 'HDFC';
        if (upper.includes('SBI')) return 'SBI';
        if (upper.includes('ICICI')) return 'ICICI';
        return null;
    }

    private _extractCardLast4(text: string): string | null {
        const match = text.match(/(?:ending|xx+|last\s*4|card\s*no\.?)\s*[-:]?\s*([0-9]{4})/i);
        return match ? match[1] : null;
    }

    private _extractUpiVpa(text: string): string | null {
        const match = text.match(/[a-zA-Z0-9.\-_]{2,}@(okaxis|oksbi|okhdfcbank|okicici|upi|paytm)/i);
        return match ? match[0] : null;
    }

    private _inferInstrument(text: string): string | null {
        const upper = text.toUpperCase();
        if (upper.includes('UPI')) return 'UPI';
        if (upper.includes('CREDIT CARD')) return 'Credit Card';
        if (upper.includes('DEBIT CARD')) return 'Debit Card';
        if (upper.includes('NETBANKING')) return 'NetBanking';
        return null;
    }

    private _cleanNoteSimple(text: string): string {
        return text.split('\n')[0].substring(0, 100).trim();
    }

    private _hashString(s: string): string {
        let hash = 0;
        for (let i = 0; i < s.length; i++) {
            const char = s.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}
