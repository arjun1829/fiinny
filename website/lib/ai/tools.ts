import { Tool } from "./ai_types";
import { ExpenseItem, IncomeItem, deleteExpense, deleteIncome } from "@/lib/firestore";
import { ChartConfig } from "./chart_service";
import { createAction } from "./action_service";
import { updateUserProfile } from "./personalization_service";

// Helper to filter data by period
const filterByPeriod = (data: any[], period: string, year?: string) => {
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    let start: Date, end: Date;

    const monthMap: Record<string, number> = {
        "january": 0, "jan": 0,
        "february": 1, "feb": 1,
        "march": 2, "mar": 2,
        "april": 3, "apr": 3,
        "may": 4,
        "june": 5, "jun": 5,
        "july": 6, "jul": 6,
        "august": 7, "aug": 7,
        "september": 8, "sep": 8,
        "october": 9, "oct": 9,
        "november": 10, "nov": 10,
        "december": 11, "dec": 11
    };

    const lowerPeriod = period.toLowerCase();

    if (lowerPeriod === "this month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (lowerPeriod === "last month") {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (monthMap[lowerPeriod] !== undefined) {
        start = new Date(targetYear, monthMap[lowerPeriod], 1);
        end = new Date(targetYear, monthMap[lowerPeriod] + 1, 0, 23, 59, 59);
    } else if (lowerPeriod === "this year" || lowerPeriod === targetYear.toString()) {
        start = new Date(targetYear, 0, 1);
        end = new Date(targetYear, 11, 31, 23, 59, 59);
    } else {
        // Default to last 30 days if unclear
        start = new Date();
        start.setDate(start.getDate() - 30);
        end = new Date();
    }

    return data.filter(item => {
        const d = item.date instanceof Date ? item.date : new Date(item.date); // Handle Firestore timestamps if needed
        return d >= start && d <= end;
    });
};

export const TOOLS: Record<string, Tool> = {
    generate_chart: {
        name: "generate_chart",
        description: "Generate a visual chart (pie, bar, line) to display data to the user. Use this when the user asks to 'show', 'visualize', or 'graph' data.",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    enum: ["pie", "bar", "line", "area"],
                    description: "The type of chart to generate."
                },
                title: {
                    type: "string",
                    description: "The title of the chart."
                },
                data: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Label for the data point (e.g. 'Food')" },
                            value: { type: "number", description: "Value for the data point (e.g. 500)" }
                        },
                        required: ["name", "value"]
                    },
                    description: "The data points to visualize."
                }
            },
            required: ["type", "title", "data"]
        },
        execute: async (args: any, context: any) => {
            // This tool doesn't fetch data, it just formats the provided data into a config
            // The LLM is responsible for aggregating the data from context or previous tools
            return {
                chartConfig: args as ChartConfig,
                message: `Here is the ${args.type} chart for ${args.title}.`
            };
        }
    },
    get_spending_summary: {
        name: "get_spending_summary",
        description: "Get total income, expense, and savings for a specific period.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", description: "e.g., 'this month', 'last month', 'november'" },
                year: { type: "string", description: "Optional year, e.g., '2024'" }
            },
            required: ["period"]
        },
        execute: async ({ period, year }, context) => {
            const { expenses, incomes } = context;
            const filteredExpenses = filterByPeriod(expenses, period, year);
            const filteredIncomes = filterByPeriod(incomes, period, year);

            const totalExpense = filteredExpenses.reduce((sum: number, e: ExpenseItem) => sum + e.amount, 0);
            const totalIncome = filteredIncomes.reduce((sum: number, i: IncomeItem) => sum + i.amount, 0);

            return {
                period,
                totalIncome,
                totalExpense,
                savings: totalIncome - totalExpense,
                savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100).toFixed(1) + "%" : "0%"
            };
        }
    },
    get_category_breakdown: {
        name: "get_category_breakdown",
        description: "Get spending broken down by category for a period.",
        parameters: {
            type: "object",
            properties: {
                period: { type: "string", description: "e.g., 'this month', 'november'" },
                year: { type: "string", description: "Optional year" }
            },
            required: ["period"]
        },
        execute: async ({ period, year }, context) => {
            const { expenses } = context;
            const filtered = filterByPeriod(expenses, period, year);

            const breakdown: Record<string, number> = {};
            filtered.forEach((e: ExpenseItem) => {
                const cat = e.category || "Uncategorized";
                breakdown[cat] = (breakdown[cat] || 0) + e.amount;
            });

            // Sort by amount desc
            const sorted = Object.entries(breakdown)
                .sort(([, a], [, b]) => b - a)
                .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});

            return { period, breakdown: sorted };
        }
    },
    get_recent_transactions: {
        name: "get_recent_transactions",
        description: "Get a list of transactions, optionally filtered by a specific date.",
        parameters: {
            type: "object",
            properties: {
                limit: { type: "number", description: "Number of transactions to return (default 5)" },
                type: { type: "string", description: "'expense', 'income', or 'all'" },
                date: { type: "string", description: "Specific date to filter by (e.g. '2024-11-02', '2nd Nov')" }
            },
            required: []
        },
        execute: async ({ limit = 5, type = "all", date }, context) => {
            const { expenses, incomes } = context;
            let all: any[] = [];

            if (type === "expense" || type === "all") all = [...all, ...expenses.map((e: any) => ({ ...e, type: "expense" }))];
            if (type === "income" || type === "all") all = [...all, ...incomes.map((i: any) => ({ ...i, type: "income" }))];

            // Filter by Date if provided
            if (date) {
                const targetDate = new Date(date);
                // Simple parser for "2nd Nov" style if standard Date parse fails or returns invalid
                let parsedDate = targetDate;

                if (isNaN(targetDate.getTime())) {
                    // Try parsing "2nd Nov" manually
                    const currentYear = new Date().getFullYear();
                    const parts = date.match(/(\d+)(?:st|nd|rd|th)?\s+([a-zA-Z]+)/i);
                    if (parts) {
                        const day = parseInt(parts[1]);
                        const monthStr = parts[2].toLowerCase();
                        const monthMap: Record<string, number> = {
                            "jan": 0, "feb": 1, "mar": 2, "apr": 3, "may": 4, "jun": 5,
                            "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11,
                            "january": 0, "february": 1, "march": 2, "april": 3, "june": 5,
                            "july": 6, "august": 7, "september": 8, "october": 9, "november": 10, "december": 11
                        };
                        if (monthMap[monthStr] !== undefined) {
                            parsedDate = new Date(currentYear, monthMap[monthStr], day);
                        }
                    }
                }

                if (!isNaN(parsedDate.getTime())) {
                    all = all.filter(t => {
                        const tDate = t.date instanceof Date ? t.date : new Date(t.date);
                        return tDate.getDate() === parsedDate.getDate() &&
                            tDate.getMonth() === parsedDate.getMonth() &&
                            tDate.getFullYear() === parsedDate.getFullYear();
                    });
                }
            }

            all.sort((a, b) => b.date.getTime() - a.date.getTime());

            return all.slice(0, limit).map(t => ({
                id: t.id,
                date: t.date.toLocaleDateString(),
                amount: t.amount,
                category: t.category || (t.type === 'income' ? 'Income' : 'Uncategorized'),
                description: t.description || t.title || "No description",
                type: t.type
            }));
        }
    },
    add_transaction: {
        name: "add_transaction",
        description: "Add a new expense or income transaction.",
        parameters: {
            type: "object",
            properties: {
                type: { type: "string", enum: ["expense", "income"], description: "Type of transaction" },
                amount: { type: "number", description: "Amount of the transaction" },
                category: { type: "string", description: "Category (e.g. Food, Travel, Salary)" },
                description: { type: "string", description: "Description or title" },
                date: { type: "string", description: "Date of transaction (YYYY-MM-DD)" }
            },
            required: ["type", "amount", "category"]
        },
        execute: async ({ type, amount, category, description, date }, context) => {
            const { setPendingAction, userId } = context;
            if (!setPendingAction || !userId) return { error: "Cannot perform action." };

            const action = createAction(
                'SAFE',
                `Add ${type === 'expense' ? 'Expense' : 'Income'}`,
                `Add ${type} of ${amount} for ${category}?`,
                async () => {
                    const { addExpense, addIncome } = await import("@/lib/firestore");
                    const dateObj = date ? new Date(date) : new Date();
                    const id = Date.now().toString();

                    if (type === 'expense') {
                        const expense: any = {
                            id,
                            type: 'expense',
                            amount,
                            note: '',
                            date: dateObj,
                            friendIds: [],
                            settledFriendIds: [],
                            payerId: userId,
                            isBill: false,
                            labels: [],
                            attachments: [],
                            category: category || 'Uncategorized',
                            title: description || category || 'Expense',
                        };
                        await addExpense(userId, expense);
                    } else {
                        const income: any = {
                            id,
                            type: 'income',
                            amount,
                            note: '',
                            date: dateObj,
                            source: 'Manual',
                            labels: [],
                            attachments: [],
                            category: category || 'Income',
                            title: description || category || 'Income',
                        };
                        await addIncome(userId, income);
                    }

                    // Refresh Dashboard
                    if (context.triggerRefresh) context.triggerRefresh();
                }
            );

            setPendingAction(action);
            return { message: "Asking for confirmation..." };
        }
    },
    delete_transaction: {
        name: "delete_transaction",
        description: "Delete a specific transaction (expense or income) by ID.",
        parameters: {
            type: "object",
            properties: {
                id: { type: "string", description: "The ID of the transaction to delete" },
                type: { type: "string", description: "'expense' or 'income'" },
                description: { type: "string", description: "Brief description for confirmation (e.g. 'Coffee at Starbucks')" }
            },
            required: ["id", "type"]
        },
        execute: async ({ id, type, description }, context) => {
            const { setPendingAction, userId } = context;

            if (!setPendingAction) {
                return { error: "Action confirmation not supported in this context." };
            }

            if (!userId) {
                return { error: "User not authenticated." };
            }

            const action = createAction(
                'DESTRUCTIVE',
                `Delete Transaction`,
                `Are you sure you want to delete this ${type}: "${description || 'Transaction'}"?`,
                async () => {
                    if (type === 'expense') {
                        await deleteExpense(userId, id);
                    } else {
                        await deleteIncome(userId, id);
                    }
                },
                true
            );

            setPendingAction(action);
            return { message: "Asking for confirmation..." };
        }
    },
    draft_email: {
        name: "draft_email",
        description: "Draft an email to a recipient with a subject and body.",
        parameters: {
            type: "object",
            properties: {
                to: { type: "string", description: "Recipient email address" },
                subject: { type: "string", description: "Email subject" },
                body: { type: "string", description: "Email body content" }
            },
            required: ["to", "subject", "body"]
        },
        execute: async ({ to, subject, body }, context) => {
            const { setPendingAction } = context;

            if (!setPendingAction) {
                return { error: "Action confirmation not supported in this context." };
            }

            const action = createAction(
                'EXTERNAL',
                `Draft Email`,
                `Open default mail app to draft email to ${to}?`,
                async () => {
                    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.open(mailtoLink, '_blank');
                }
            );

            setPendingAction(action);
            return { message: "Asking for confirmation..." };
        }
    },
    update_financial_profile: {
        name: "update_financial_profile",
        description: "Update the user's financial profile (risk tolerance, communication style, goals).",
        parameters: {
            type: "object",
            properties: {
                riskTolerance: { type: "string", enum: ["low", "medium", "high"] },
                communicationStyle: { type: "string", enum: ["empathetic", "direct", "humorous"] },
                addGoal: { type: "string", description: "A new financial goal to add" },
                addStruggle: { type: "string", description: "A spending struggle to add" }
            },
            required: []
        },
        execute: async (args: any, context: any) => {
            const { userId } = context;
            if (!userId) return { error: "User not authenticated" };

            const updates: any = {};
            if (args.riskTolerance) updates.riskTolerance = args.riskTolerance;
            if (args.communicationStyle) updates.communicationStyle = args.communicationStyle;

            // For arrays, we'd ideally fetch first, but for now let's just assume we append in a real app
            // Here we'll just update the simple fields for the MVP

            await updateUserProfile(userId, updates);
            return { message: "Profile updated successfully." };
        }
    },
    calculate_split_bill: {
        name: "calculate_split_bill",
        description: "Calculate how much each person owes for a shared bill.",
        parameters: {
            type: "object",
            properties: {
                totalAmount: { type: "number", description: "Total bill amount" },
                peopleCount: { type: "number", description: "Number of people splitting" },
                tipPercentage: { type: "number", description: "Tip percentage (0-100)" }
            },
            required: ["totalAmount", "peopleCount"]
        },
        execute: async ({ totalAmount, peopleCount, tipPercentage = 0 }, context) => {
            const totalWithTip = totalAmount * (1 + tipPercentage / 100);
            const perPerson = totalWithTip / peopleCount;
            return {
                total: totalAmount,
                totalWithTip: parseFloat(totalWithTip.toFixed(2)),
                perPerson: parseFloat(perPerson.toFixed(2)),
                message: `Each person owes ${perPerson.toFixed(2)}.`
            };
        }
    },
    share_transaction: {
        name: "share_transaction",
        description: "Share a transaction or message via WhatsApp or Copy.",
        parameters: {
            type: "object",
            properties: {
                text: { type: "string", description: "The text to share" },
                platform: { type: "string", enum: ["whatsapp", "copy"], description: "Platform to share to" }
            },
            required: ["text"]
        },
        execute: async ({ text, platform = "whatsapp" }, context) => {
            const { setPendingAction } = context;
            if (!setPendingAction) return { error: "Action confirmation not supported." };

            const action = createAction(
                'EXTERNAL',
                `Share via ${platform}`,
                `Share this message: "${text}"?`,
                async () => {
                    if (platform === 'whatsapp') {
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                    } else {
                        await navigator.clipboard.writeText(text);
                        alert("Copied to clipboard!");
                    }
                }
            );

            setPendingAction(action);
            return { message: "Asking for confirmation..." };
        }
    },
    get_crypto_price: {
        name: "get_crypto_price",
        description: "Get the current price of a cryptocurrency (e.g. bitcoin, ethereum).",
        parameters: {
            type: "object",
            properties: {
                coinId: { type: "string", description: "The ID of the coin (e.g. 'bitcoin', 'ethereum', 'dogecoin')" },
                currency: { type: "string", description: "Target currency (usd, inr, eur)", default: "usd" }
            },
            required: ["coinId"]
        },
        execute: async ({ coinId, currency = "usd" }, context) => {
            try {
                const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${currency}`);
                const data = await response.json();
                if (data[coinId]) {
                    const price = data[coinId][currency];
                    return {
                        coin: coinId,
                        price,
                        currency: currency.toUpperCase(),
                        message: `The current price of ${coinId} is ${price} ${currency.toUpperCase()}.`
                    };
                } else {
                    return { error: "Coin not found." };
                }
            } catch (e) {
                return { error: "Failed to fetch price." };
            }
        }
    }
};
