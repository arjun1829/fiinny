import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, Firestore } from "firebase/firestore";
import { TimeEngine } from "@/lib/ai/time_engine";
import { TrendEngine } from "@/lib/ai/trend_engine";
import { InferenceEngine } from "@/lib/ai/inference_engine";
import { ExpenseItem, FriendModel } from "@/lib/firestore";
import { startOfYear, endOfYear, subYears, isWithinInterval, startOfMonth, endOfMonth, subMonths } from "date-fns";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { query, userPhone } = body;

        if (!userPhone || !query) {
            return NextResponse.json(
                { error: "Missing userPhone or query" },
                { status: 400 }
            );
        }

        const queryLower = query.trim().toLowerCase();

        // === 0. IMMEDIATE GREETING HANDLER (No DB required) ===
        if (queryLower === 'hi' || queryLower === 'hello' || queryLower === 'hey') {
            return NextResponse.json({ response: "Hi there! I'm Fiinny Brain. Ask me about your expenses, travel, or splits!" });
        }

        // === UNSUPPORTED INTENTS ===
        if (queryLower.startsWith('add') || queryLower.includes('create expense')) {
            return NextResponse.json({ response: "I can't add expenses yet, but I can analyze them! Try adding it via the + button." });
        }

        // Fetch user's expenses, incomes, and friends
        // Database calls
        const [expensesSnap, incomesSnap, friendsSnap] = await Promise.all([
            getDocs(collection(db, "users", userPhone, "expenses")),
            getDocs(collection(db, "users", userPhone, "incomes")),
            getDocs(collection(db, "users", userPhone, "friends")),
        ]);

        const expenses = expensesSnap.docs.map((doc) => {
            const data = doc.data();
            let date = new Date();
            // Safe date parsing
            if (data.date && typeof data.date.toDate === 'function') {
                date = data.date.toDate();
            } else if (data.date instanceof Date) {
                date = data.date;
            } else if (typeof data.date === 'string') {
                date = new Date(data.date);
            }

            return {
                id: doc.id,
                ...data,
                date: date,
                amount: Number(data.amount) || 0, // safe amount
                labels: Array.isArray(data.labels) ? data.labels : [],
            } as ExpenseItem;
        });

        const incomes = incomesSnap.docs.map((doc) => {
            const data = doc.data();
            let date = new Date();
            if (data.date && typeof data.date.toDate === 'function') {
                date = data.date.toDate();
            } else if (data.date instanceof Date) {
                date = data.date;
            } else if (typeof data.date === 'string') {
                date = new Date(data.date);
            }
            return {
                id: doc.id,
                ...data,
                date: date,
                amount: Number(data.amount) || 0, // safe amount
            };
        });

        const friends = friendsSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as unknown as FriendModel));

        const friendMap: Record<string, string> = {};
        friends.forEach(f => {
            if (f.phone) friendMap[f.phone] = f.name;
        });

        // Process query
        if (query.trim().toLowerCase() === "debug") {
            return NextResponse.json({ response: `Debug: Loaded ${expenses.length} expenses, ${friendsSnap.docs.length} friends.` });
        }

        const response = await processQuery(query, expenses, incomes, userPhone, friendMap);
        return NextResponse.json({ response });

    } catch (error: any) {
        console.error("Error processing query:", error);
        return NextResponse.json({
            response: `Sorry, I encountered an error: ${error.message || String(error)}`
        });
    }
}

async function processQuery(
    query: string,
    expenses: ExpenseItem[],
    incomes: any[],
    userPhone: string,
    friendMap: Record<string, string>
): Promise<string> {
    const queryLower = query.toLowerCase();
    const now = new Date();

    // === 1. TIMEFRAME FILTERING (Basic) ===
    let filteredExpenses = expenses;
    let timeframeLabel = "all time";

    if (queryLower.includes("this year")) {
        const start = startOfYear(now);
        const end = endOfYear(now);
        filteredExpenses = expenses.filter(e => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "this year";
    } else if (queryLower.includes("last year")) {
        const start = startOfYear(subYears(now, 1));
        const end = endOfYear(subYears(now, 1));
        filteredExpenses = expenses.filter(e => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "last year";
    } else if (queryLower.includes("this month")) {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        filteredExpenses = expenses.filter(e => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "this month";
    }

    // === 2. TIME ENGINE ALIASES ===
    if (queryLower.includes("weekend")) {
        filteredExpenses = TimeEngine.filterByDayType(filteredExpenses, true);
        const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        return `You spent ₹${total.toFixed(0)} on weekends (${timeframeLabel}).`;
    }

    if (['morning', 'afternoon', 'evening', 'night'].some(t => queryLower.includes(t))) {
        const period = ['morning', 'afternoon', 'evening', 'night'].find(t => queryLower.includes(t))!;
        filteredExpenses = TimeEngine.filterByTimeOfDay(filteredExpenses, period);
        const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        return `You spent ₹${total.toFixed(0)} in the ${period} (${timeframeLabel}).`;
    }

    // === 3. TREND ENGINE ===
    if (queryLower.includes("increas") || queryLower.includes("decreas") || queryLower.includes("trend")) {
        // Compare this month vs last month
        const thisMonth = expenses.filter(e => isWithinInterval(e.date, { start: startOfMonth(now), end: endOfMonth(now) }));
        const lastMonth = expenses.filter(e => isWithinInterval(e.date, { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) }));

        const growth = TrendEngine.calculateGrowthRate(thisMonth, lastMonth);
        const direction = TrendEngine.analyzeTrendDirection(growth);

        return `Your spending is ${direction} (${growth.toFixed(1)}% vs last month).`;
    }

    if (queryLower.includes("spike") || queryLower.includes("anomaly")) {
        const thisMonth = expenses.filter(e => isWithinInterval(e.date, { start: startOfMonth(now), end: endOfMonth(now) }));
        const history = expenses.filter(e => e.date < startOfMonth(now)); // All history before this month

        const result = TrendEngine.detectAnomaly(thisMonth, history);
        return result.message;
    }


    // === 4. SPLIT/FRIEND QUERIES (Enhanced) ===
    if (
        queryLower.includes("owe") ||
        queryLower.includes("pending") ||
        queryLower.includes("friend")
    ) {
        const splitExpenses = expenses.filter(
            (e) => e.friendIds && e.friendIds.length > 0
        );

        if (queryLower.includes("owe") && queryLower.includes("me")) {
            // Calculate who owes user
            const balances: Record<string, number> = {};
            splitExpenses.forEach((expense) => {
                if (expense.payerId === userPhone) {
                    const splitAmount = expense.amount / (expense.friendIds.length + 1);
                    expense.friendIds.forEach((friendId: string) => {
                        balances[friendId] = (balances[friendId] || 0) + splitAmount;
                    });
                }
            });

            if (Object.keys(balances).length === 0) {
                return "No one owes you money right now.";
            }

            const details = Object.entries(balances)
                .map(([friendId, amount]) => {
                    const name = friendMap[friendId] || friendId;
                    return `${name}: ₹${amount.toFixed(0)}`;
                })
                .join("\n");
            return `People who owe you:\n${details}`;
        }

        // "How much do I owe X?"
        if (queryLower.includes("owe")) {
            // Find friend name in query
            const friendName = Object.values(friendMap).find(name => queryLower.includes(name.toLowerCase()));
            if (friendName) {
                // Calculate debt to this friend
                // (Simplified logic: assuming 50/50 splits where friend paid)
                // NOTE: To do this accurately we need to know who paid.
                // Expenses where payerId == friendPhone and friendIds contains userPhone.
                // But we only have `expenses` (user's expenses). if user is not payer, logic is tricky if data model is "ExpenseItem is created primarily by payer".
                // Usually split expenses are synced.
                // Let's stick to "User Owes" logic if data supports it, or just "Owe Me" for now.
                // The "How much does karan owe me" was the user's specific query. It falls into the block above if the user types "owe me".
                // But if they type "owe [name]", we need to resolve name back to ID.

                // Reverse map
                const friendId = Object.keys(friendMap).find(key => friendMap[key].toLowerCase() === friendName.toLowerCase());
                if (friendId) {
                    // Check balances[friendId] from above logic?
                    // We need to re-run the "owe me" calc.
                    const balances: Record<string, number> = {};
                    splitExpenses.forEach((expense) => {
                        if (expense.payerId === userPhone) {
                            const splitAmount = expense.amount / (expense.friendIds.length + 1);
                            expense.friendIds.forEach((fid: string) => {
                                balances[fid] = (balances[fid] || 0) + splitAmount;
                            });
                        }
                    });

                    const amount = balances[friendId] || 0;
                    return `${friendName} owes you ₹${amount.toFixed(0)}.`;
                }
            }
        }

        return `You have ${splitExpenses.length} split expenses.`;
    }

    // === 5. INFERENCE & CATEGORY ==

    // Check for "Hospital travel", "Medical", etc.
    if (queryLower.includes("hospital") && queryLower.includes("travel")) {
        const found = InferenceEngine.inferComplexIntent(filteredExpenses, 'hospital_travel');
        const total = found.reduce((sum, e) => sum + e.amount, 0);
        return `Found ${found.length} hospital travel expenses totaling ₹${total.toFixed(0)}.`;
    }

    // Check inferred context
    const contexts = ['office', 'vacation'];
    for (const ctx of contexts) {
        if (queryLower.includes(ctx)) {
            const found = InferenceEngine.inferContext(filteredExpenses, ctx);
            const total = found.reduce((sum, e) => sum + e.amount, 0);
            return `You spent ₹${total.toFixed(0)} on ${ctx} (${timeframeLabel}).`;
        }
    }

    // Check inferred category
    const categories = ['travel', 'food', 'shopping', 'grocery', 'medical', 'entertainment'];
    for (const cat of categories) {
        if (queryLower.includes(cat)) {
            const found = InferenceEngine.inferByCategory(filteredExpenses, cat);
            const total = found.reduce((sum, e) => sum + e.amount, 0);
            return `You spent ₹${total.toFixed(0)} on ${cat} (${timeframeLabel}).`;
        }
    }


    // === 6. FALLBACK: GENERAL SUMMARY ===
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
    const savings = totalIncome - totalExpense;

    return `Financial Summary (${timeframeLabel}):\nIncome: ₹${totalIncome.toFixed(0)}\nExpenses: ₹${totalExpense.toFixed(0)}\nSavings: ₹${savings.toFixed(0)}\n\nTry asking: "How much on weekends?", "Is my spending increasing?", or "Travel expenses last year"`;
}
