import * as functions from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { startOfYear, endOfYear, subYears, isWithinInterval, startOfMonth, endOfMonth, subMonths, } from "date-fns";
import { CategoryRules } from "./categoryRules.js";
const db = getFirestore();
// Simplified engines (inline for Cloud Functions)
class TimeEngine {
    static filterByDayType(expenses, isWeekend) {
        return expenses.filter((e) => {
            const day = e.date.getDay();
            const weekend = day === 0 || day === 6;
            return isWeekend ? weekend : !weekend;
        });
    }
    static filterByTimeOfDay(expenses, period) {
        return expenses.filter((e) => {
            const hour = e.date.getHours();
            if (period === "morning")
                return hour >= 6 && hour < 12;
            if (period === "afternoon")
                return hour >= 12 && hour < 17;
            if (period === "evening")
                return hour >= 17 && hour < 21;
            if (period === "night")
                return hour >= 21 || hour < 6;
            return false;
        });
    }
}
class TrendEngine {
    static calculateGrowthRate(current, previous) {
        const currentTotal = current.reduce((sum, e) => sum + e.amount, 0);
        const previousTotal = previous.reduce((sum, e) => sum + e.amount, 0);
        if (previousTotal === 0)
            return 0;
        return ((currentTotal - previousTotal) / previousTotal) * 100;
    }
    static analyzeTrendDirection(growth) {
        if (growth > 10)
            return "increasing significantly";
        if (growth > 0)
            return "slightly increasing";
        if (growth < -10)
            return "decreasing significantly";
        if (growth < 0)
            return "slightly decreasing";
        return "stable";
    }
    static detectAnomaly(current, history) {
        const currentTotal = current.reduce((sum, e) => sum + e.amount, 0);
        const avgHistorical = history.reduce((sum, e) => sum + e.amount, 0) / Math.max(history.length, 1);
        const deviation = ((currentTotal - avgHistorical) / avgHistorical) * 100;
        if (deviation > 50) {
            return { message: `⚠️ Spending spike detected! ${deviation.toFixed(0)}% above average.` };
        }
        return { message: "No anomalies detected." };
    }
}
class InferenceEngine {
    static inferComplexIntent(expenses, intent) {
        if (intent === "hospital_travel") {
            return expenses.filter((e) => e.labels?.some((l) => l.toLowerCase().includes("hospital") || l.toLowerCase().includes("medical")));
        }
        return [];
    }
    static inferContext(expenses, context) {
        return expenses.filter((e) => e.labels?.some((l) => l.toLowerCase().includes(context)));
    }
    static inferByCategory(expenses, category) {
        return expenses.filter((e) => e.labels?.some((l) => l.toLowerCase().includes(category)));
    }
}
async function processQuery(query, expenses, incomes, userPhone, friendMap) {
    const queryLower = query.toLowerCase();
    const now = new Date();
    // === 1. TIMEFRAME FILTERING ===
    let filteredExpenses = expenses;
    let timeframeLabel = "all time";
    if (queryLower.includes("this year")) {
        const start = startOfYear(now);
        const end = endOfYear(now);
        filteredExpenses = expenses.filter((e) => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "this year";
    }
    else if (queryLower.includes("last year")) {
        const start = startOfYear(subYears(now, 1));
        const end = endOfYear(subYears(now, 1));
        filteredExpenses = expenses.filter((e) => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "last year";
    }
    else if (queryLower.includes("this month")) {
        const start = startOfMonth(now);
        const end = endOfMonth(now);
        filteredExpenses = expenses.filter((e) => isWithinInterval(e.date, { start, end }));
        timeframeLabel = "this month";
    }
    // === 2. TIME ENGINE ===
    if (queryLower.includes("weekend")) {
        filteredExpenses = TimeEngine.filterByDayType(filteredExpenses, true);
        const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        return `You spent ₹${total.toFixed(0)} on weekends (${timeframeLabel}).`;
    }
    if (["morning", "afternoon", "evening", "night"].some((t) => queryLower.includes(t))) {
        const period = ["morning", "afternoon", "evening", "night"].find((t) => queryLower.includes(t));
        filteredExpenses = TimeEngine.filterByTimeOfDay(filteredExpenses, period);
        const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
        return `You spent ₹${total.toFixed(0)} in the ${period} (${timeframeLabel}).`;
    }
    // === 3. TREND ENGINE ===
    if (queryLower.includes("increas") || queryLower.includes("decreas") || queryLower.includes("trend")) {
        const thisMonth = expenses.filter((e) => isWithinInterval(e.date, { start: startOfMonth(now), end: endOfMonth(now) }));
        const lastMonth = expenses.filter((e) => isWithinInterval(e.date, { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) }));
        const growth = TrendEngine.calculateGrowthRate(thisMonth, lastMonth);
        const direction = TrendEngine.analyzeTrendDirection(growth);
        return `Your spending is ${direction} (${growth.toFixed(1)}% vs last month).`;
    }
    if (queryLower.includes("spike") || queryLower.includes("anomaly")) {
        const thisMonth = expenses.filter((e) => isWithinInterval(e.date, { start: startOfMonth(now), end: endOfMonth(now) }));
        const history = expenses.filter((e) => e.date < startOfMonth(now));
        const result = TrendEngine.detectAnomaly(thisMonth, history);
        return result.message;
    }
    // === 4. SPLIT/FRIEND QUERIES ===
    if (queryLower.includes("owe") || queryLower.includes("pending") || queryLower.includes("friend")) {
        const splitExpenses = expenses.filter((e) => e.friendIds && e.friendIds.length > 0);
        if (queryLower.includes("owe") && queryLower.includes("me")) {
            const balances = {};
            splitExpenses.forEach((expense) => {
                if (expense.payerId === userPhone) {
                    const splitAmount = expense.amount / (expense.friendIds.length + 1);
                    expense.friendIds.forEach((friendId) => {
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
        if (queryLower.includes("owe")) {
            const friendName = Object.values(friendMap).find((name) => queryLower.includes(name.toLowerCase()));
            if (friendName) {
                const friendId = Object.keys(friendMap).find((key) => friendMap[key].toLowerCase() === friendName.toLowerCase());
                if (friendId) {
                    const balances = {};
                    splitExpenses.forEach((expense) => {
                        if (expense.payerId === userPhone) {
                            const splitAmount = expense.amount / (expense.friendIds.length + 1);
                            expense.friendIds.forEach((fid) => {
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
    // === 5. INFERENCE & CATEGORY ===
    if (queryLower.includes("hospital") && queryLower.includes("travel")) {
        const found = InferenceEngine.inferComplexIntent(filteredExpenses, "hospital_travel");
        const total = found.reduce((sum, e) => sum + e.amount, 0);
        return `Found ${found.length} hospital travel expenses totaling ₹${total.toFixed(0)}.`;
    }
    const contexts = ["office", "vacation"];
    for (const ctx of contexts) {
        if (queryLower.includes(ctx)) {
            const found = InferenceEngine.inferContext(filteredExpenses, ctx);
            const total = found.reduce((sum, e) => sum + e.amount, 0);
            return `You spent ₹${total.toFixed(0)} on ${ctx} (${timeframeLabel}).`;
        }
    }
    const categories = ["travel", "food", "shopping", "grocery", "medical", "entertainment"];
    for (const cat of categories) {
        if (queryLower.includes(cat)) {
            const found = InferenceEngine.inferByCategory(filteredExpenses, cat);
            const total = found.reduce((sum, e) => sum + e.amount, 0);
            return `You spent ₹${total.toFixed(0)} on ${cat} (${timeframeLabel}).`;
        }
    }
    // === 6. FALLBACK ===
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
    const savings = totalIncome - totalExpense;
    return `Financial Summary (${timeframeLabel}):\nIncome: ₹${totalIncome.toFixed(0)}\nExpenses: ₹${totalExpense.toFixed(0)}\nSavings: ₹${savings.toFixed(0)}\n\nTry asking: "How much on weekends?", "Is my spending increasing?", or "Travel expenses last year"`;
}
export const fiinnyBrainQuery = functions.https.onRequest(async (req, res) => {
    // CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    try {
        const { query, userPhone } = req.body;
        if (!userPhone || !query) {
            res.status(400).json({ error: "Missing userPhone or query" });
            return;
        }
        const queryLower = query.trim().toLowerCase();
        // Immediate greeting
        if (queryLower === "hi" || queryLower === "hello" || queryLower === "hey") {
            res.json({ response: "Hi there! I'm Fiinny Brain. Ask me about your expenses, travel, or splits!" });
            return;
        }
        // === ADD EXPENSE INTENT ===
        if (queryLower.startsWith("add") || queryLower.includes("spent") || queryLower.includes("paid")) {
            // Parse amount from query
            const amountMatch = query.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:rs|rupees|₹)?/i);
            if (!amountMatch) {
                res.json({ response: "Please specify an amount. Example: 'add expense of 500rs'" });
                return;
            }
            const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
            // Use CategoryRules for smart categorization
            const categoryGuess = CategoryRules.categorizeMerchant(query);
            const category = categoryGuess.category;
            const subcategory = categoryGuess.subcategory;
            // Extract description (everything after "for" or use subcategory)
            let description = subcategory;
            const forMatch = query.match(/for\s+(.+?)(?:\s+\d|$)/i);
            if (forMatch) {
                description = forMatch[1].trim();
            }
            // Add expense to Firestore
            try {
                await db.collection("users").doc(userPhone).collection("expenses").add({
                    amount,
                    category,
                    subcategory,
                    description,
                    date: new Date(),
                    labels: [category.toLowerCase(), ...categoryGuess.tags],
                    payerId: userPhone,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                res.json({ response: `✅ Added expense: ₹${amount.toFixed(0)} for ${description} (${category})` });
                return;
            }
            catch (error) {
                res.json({ response: `Failed to add expense: ${error.message}` });
                return;
            }
        }
        // Fetch data
        const [expensesSnap, incomesSnap, friendsSnap] = await Promise.all([
            db.collection("users").doc(userPhone).collection("expenses").get(),
            db.collection("users").doc(userPhone).collection("incomes").get(),
            db.collection("users").doc(userPhone).collection("friends").get(),
        ]);
        const expenses = expensesSnap.docs.map((doc) => {
            const data = doc.data();
            let date = new Date();
            if (data.date?.toDate) {
                date = data.date.toDate();
            }
            else if (data.date instanceof Date) {
                date = data.date;
            }
            else if (typeof data.date === "string") {
                date = new Date(data.date);
            }
            return {
                id: doc.id,
                ...data,
                date,
                amount: Number(data.amount) || 0,
                labels: Array.isArray(data.labels) ? data.labels : [],
            };
        });
        const incomes = incomesSnap.docs.map((doc) => {
            const data = doc.data();
            let date = new Date();
            if (data.date?.toDate) {
                date = data.date.toDate();
            }
            else if (data.date instanceof Date) {
                date = data.date;
            }
            else if (typeof data.date === "string") {
                date = new Date(data.date);
            }
            return {
                id: doc.id,
                ...data,
                date,
                amount: Number(data.amount) || 0,
            };
        });
        const friends = friendsSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        const friendMap = {};
        friends.forEach((f) => {
            if (f.phone)
                friendMap[f.phone] = f.name;
        });
        if (query.trim().toLowerCase() === "debug") {
            res.json({ response: `Debug: Loaded ${expenses.length} expenses, ${friendsSnap.docs.length} friends.` });
            return;
        }
        const response = await processQuery(query, expenses, incomes, userPhone, friendMap);
        res.json({ response });
    }
    catch (error) {
        console.error("Error processing query:", error);
        res.json({ response: `Sorry, I encountered an error: ${error.message || String(error)}` });
    }
});
//# sourceMappingURL=fiinnyBrainQuery.js.map