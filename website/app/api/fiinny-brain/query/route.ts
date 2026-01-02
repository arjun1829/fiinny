import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query as firestoreQuery } from "firebase/firestore";

export async function POST(request: NextRequest) {
    try {
        const { userPhone, query } = await request.json();

        if (!userPhone || !query) {
            return NextResponse.json(
                { error: "Missing userPhone or query" },
                { status: 400 }
            );
        }

        // Fetch user's expenses and incomes
        const expensesRef = collection(db, "users", userPhone, "expenses");
        const incomesRef = collection(db, "users", userPhone, "incomes");

        const [expensesSnap, incomesSnap] = await Promise.all([
            getDocs(expensesRef),
            getDocs(incomesRef),
        ]);

        const expenses = expensesSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate() || new Date(),
        }));

        const incomes = incomesSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate() || new Date(),
        }));

        // Process query (simplified version - you'll need to port the Dart logic)
        const response = await processQuery(query, expenses, incomes, userPhone);

        return NextResponse.json({ response });
    } catch (error) {
        console.error("Error processing query:", error);
        return NextResponse.json(
            { error: "Failed to process query" },
            { status: 500 }
        );
    }
}

async function processQuery(
    query: string,
    expenses: any[],
    incomes: any[],
    userPhone: string
): Promise<string> {
    const queryLower = query.toLowerCase();

    // Split/Friend queries
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
                .map(([friend, amount]) => `${friend}: ₹${amount.toFixed(0)}`)
                .join("\n");
            return `People who owe you:\n${details}`;
        }

        return `You have ${splitExpenses.length} split expenses.`;
    }

    // Travel queries
    if (
        queryLower.includes("travel") ||
        queryLower.includes("trip") ||
        queryLower.includes("flight")
    ) {
        const travelExpenses = expenses.filter(
            (e) =>
                e.category?.toLowerCase().includes("travel") ||
                e.category?.toLowerCase().includes("flight") ||
                e.labels?.some((l: string) => l.toLowerCase().includes("trip"))
        );

        const total = travelExpenses.reduce((sum, e) => sum + e.amount, 0);
        return `You spent ₹${total.toFixed(0)} on travel (${travelExpenses.length} expenses)`;
    }

    // Expense verification
    if (queryLower.includes("tracked") || queryLower.includes("recorded")) {
        let searchTerm = "";
        if (queryLower.includes("flight")) searchTerm = "flight";
        else if (queryLower.includes("metro")) searchTerm = "metro";

        if (searchTerm) {
            const found = expenses.filter(
                (e) =>
                    e.note?.toLowerCase().includes(searchTerm) ||
                    e.category?.toLowerCase().includes(searchTerm)
            );

            if (found.length > 0) {
                const total = found.reduce((sum, e) => sum + e.amount, 0);
                return `Yes, I found ${found.length} ${searchTerm} expense(s) totaling ₹${total.toFixed(0)}`;
            }
            return `No ${searchTerm} expenses found.`;
        }
    }

    // General summary
    const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
    const savings = totalIncome - totalExpense;

    return `Financial Summary:\nIncome: ₹${totalIncome.toFixed(0)}\nExpenses: ₹${totalExpense.toFixed(0)}\nSavings: ₹${savings.toFixed(0)}\n\nAsk me anything about your expenses, splits, or travel!`;
}
