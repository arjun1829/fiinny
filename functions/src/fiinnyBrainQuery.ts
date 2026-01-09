import * as functions from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import OpenAI from "openai";

const db = getFirestore();

// Initialize OpenAI (Lazy)
let openaiInstance: OpenAI | null = null;
function getOpenAI() {
    if (openaiInstance) return openaiInstance;
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        throw new Error("Missing OPENAI_API_KEY in environment");
    }
    openaiInstance = new OpenAI({ apiKey: key });
    return openaiInstance;
}

export const fiinnyBrainQuery = functions.https.onRequest(async (req, res) => {
    // CORS
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

        if (!query || !userPhone) {
            res.status(400).json({ error: "Missing query or userPhone" });
            return;
        }

        console.log(`Processing query: "${query}" for user: ${userPhone}`);

        // Fetch recent expenses for context
        const recentSnap = await db.collection("users").doc(userPhone).collection("expenses")
            .orderBy("createdAt", "desc")
            .limit(5)
            .get();

        const recentHistory = recentSnap.docs.map(doc => {
            const d = doc.data();
            return `ID: ${doc.id} | ${d.date?.toDate?.().toISOString().split('T')[0]} | ₹${d.amount} | ${d.category} | ${d.description}`;
        }).join("\n");

        // Call OpenAI with function calling
        const openai = getOpenAI();
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Cheap and fast
            messages: [
                {
                    role: "system",
                    content: `You are Fiinny, a smart, friendly, and concise financial assistant.
                    
YOUR CAPABILITIES:
1. Manage expenses: Add, query, and split expenses.
2. Analyze spending: Explain trends based on data provided.

RULES:
- Data Privacy: Do not share sensitive personal info.
- Tone: Casual, helpful, encouraging.
- Currency: ALWAYS use ₹ (Indian Rupees) symbol for all amounts. NEVER use $ or any other currency.
- Context: You have access to the user's recent expense history. Use it to resolve references like "split that" (referring to the last expense).
- If you add an expense, confirm with a checkmark emoji and a brief summary.
- If you split an expense, mention who it was split with.

TOOLS:
- Use 'addExpense' when the user wants to log a NEW transaction.
- Use 'getExpenses' when the user asks about past spending.
- Use 'splitExpense' when the user wants to split a cost with friends.`
                },
                {
                    role: "user",
                    content: `My recent expenses:\n${recentHistory}\n\nMy Friend List is accessible via tools.`
                },
                {
                    role: "assistant",
                    content: "Understood. I have your recent expense memory. Ready to help you."
                },
                {
                    role: "user",
                    content: query
                }
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "addExpense",
                        description: "Adds a new expense to the database.",
                        parameters: {
                            type: "object",
                            properties: {
                                amount: { type: "number", description: "Amount in number" },
                                category: { type: "string", description: "Category (e.g., food, travel)" },
                                description: { type: "string", description: "Description of the expense" },
                                dateIso: { type: "string", description: "Date in ISO 8601 format (YYYY-MM-DD)" },
                                splitWithNames: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "List of friend names to split with"
                                }
                            },
                            required: ["amount", "category", "description", "dateIso"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "getExpenses",
                        description: "Queries expenses for a specific date range or category.",
                        parameters: {
                            type: "object",
                            properties: {
                                startDateIso: { type: "string", description: "Start date YYYY-MM-DD" },
                                endDateIso: { type: "string", description: "End date YYYY-MM-DD" },
                                category: { type: "string", description: "Optional category filter" }
                            },
                            required: ["startDateIso", "endDateIso"]
                        }
                    }
                },
                {
                    type: "function",
                    function: {
                        name: "splitExpense",
                        description: "Splits an EXISTING expense with friends.",
                        parameters: {
                            type: "object",
                            properties: {
                                expenseId: { type: "string", description: "The ID of the expense to split" },
                                friendNames: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "Names of friends"
                                }
                            },
                            required: ["expenseId", "friendNames"]
                        }
                    }
                }
            ]
        });

        const message = completion.choices[0].message;

        // Handle function calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            console.log("Function Call Triggered:", functionName, functionArgs);

            const apiResponse = await handleToolCall(userPhone, functionName, functionArgs);

            // Get final response from OpenAI
            const openai = getOpenAI();
            const finalCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    ...completion.choices[0].message.tool_calls ? [{
                        role: "assistant" as const,
                        content: null,
                        tool_calls: completion.choices[0].message.tool_calls
                    }] : [],
                    {
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: JSON.stringify(apiResponse)
                    }
                ]
            });

            res.json({ response: finalCompletion.choices[0].message.content });
        } else {
            res.json({ response: message.content });
        }

    } catch (error: any) {
        console.error("Critical Error:", error);
        res.json({ response: `Fiinny AI Error: ${error.message}` });
    }
});

async function handleToolCall(userPhone: string, name: string, args: any) {
    if (name === "addExpense") {
        const { amount, category, description, dateIso, splitWithNames } = args;
        const date = new Date(dateIso);

        let friendIds: string[] = [];
        if (splitWithNames && splitWithNames.length > 0) {
            friendIds = await findFriendIds(userPhone, splitWithNames);
        }

        const docRef = await db.collection("users").doc(userPhone).collection("expenses").add({
            amount, category, description, date,
            friendIds,
            payerId: userPhone,
            labels: [category.toLowerCase()],
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return { success: true, message: "Added successfully", id: docRef.id };
    }

    if (name === "getExpenses") {
        const { startDateIso, endDateIso, category } = args;
        const start = new Date(startDateIso);
        const end = new Date(endDateIso);

        let q = db.collection("users").doc(userPhone).collection("expenses")
            .where("date", ">=", start)
            .where("date", "<=", end);

        const snap = await q.get();
        const expenses = snap.docs.map(doc => doc.data())
            .filter(d => !category || (d.category || "").toLowerCase() === category.toLowerCase());

        const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        return {
            count: expenses.length,
            total: total,
            expenses: expenses.map(e => ({
                amount: e.amount,
                cat: e.category,
                desc: e.description,
                date: e.date?.toDate?.()
            }))
        };
    }

    if (name === "splitExpense") {
        const { expenseId, friendNames } = args;
        const friendIds = await findFriendIds(userPhone, friendNames);

        if (friendIds.length === 0) return { success: false, message: "No matching friends found." };

        await db.collection("users").doc(userPhone).collection("expenses").doc(expenseId).update({
            friendIds: friendIds,
            splitWith: friendIds
        });

        return { success: true, message: `Split with ${friendNames.join(", ")}` };
    }

    return { error: "Unknown function" };
}

async function findFriendIds(userPhone: string, names: string[]) {
    if (!names || names.length === 0) return [];

    console.log(`Looking for friends: ${names.join(", ")}`);
    const friendsSnap = await db.collection("users").doc(userPhone).collection("friends").get();
    const friendIds: string[] = [];

    friendsSnap.forEach(doc => {
        const data = doc.data();
        const friendName = (data.name || "").toLowerCase();
        names.forEach(name => {
            if (friendName.includes(name.toLowerCase())) {
                friendIds.push(data.phone || doc.id);
            }
        });
    });

    return [...new Set(friendIds)];
}
