import { Message, Tool } from "./ai_types";
import { TOOLS } from "./tools";
// import { remember, recall } from "./memory_service";
import { generateWebLLMResponse, isWebLLMLoaded } from "./providers/webllm_client";
import { PendingAction } from "./action_service";
import { SmartParser } from "@/lib/smart_parser";

// Main Entry Point
export const generateResponse = async (
    messages: Message[],
    contextData: any,
    isPremium: boolean,
    isModelLoaded: boolean,
    setPendingAction?: (action: PendingAction | null) => void
): Promise<Message> => {
    const lastMessage = messages[messages.length - 1];
    const userQuery = lastMessage.content;
    const { expenses, incomes, userId, profile } = contextData;

    // System Prompt Construction
    let systemPrompt = `You are Fiinny, a financial wellness coach.
    
    USER PROFILE:
    - Risk Tolerance: ${profile?.riskTolerance || 'Unknown'}
    - Communication Style: ${profile?.communicationStyle || 'Empathetic'}
    - Goals: ${profile?.financialGoals?.join(", ") || 'None'}
    
    INSTRUCTIONS:
    - Adapt your tone to the user's communication style.
    - If risk tolerance is LOW, advise caution. If HIGH, allow for calculated risks.
    - You have access to the user's financial data (expenses, incomes).
    - Use tools when necessary to visualize data or perform actions.
    - Keep responses concise and helpful.`;

    // 0. RAG: Recall relevant memories
    let memoryContext = "";
    try {
        // const memories = await recall(userQuery);
        const memories: string[] = [];
        if (memories.length > 0) {
            memoryContext = `\n\n[RELEVANT MEMORIES]:\n${memories.join("\n")}`;
            console.log("Recalled memories:", memories);
        }
    } catch (e) {
        console.warn("Memory recall failed:", e);
    }

    // 1. MEMORY: Auto-save important user facts
    if (userQuery.match(/I (am|want|like|have|need)|My (goal|plan|budget)/i)) {
        // remember(userQuery).catch(e => console.error("Memory store failed:", e));
    }

    // Inject memory into the last message for the LLM
    const messagesWithMemory = [...messages];
    if (memoryContext) {
        messagesWithMemory[messagesWithMemory.length - 1] = {
            ...lastMessage,
            content: lastMessage.content + memoryContext
        };
    }

    // 2. Check for Local Brain (WebLLM)
    if (isModelLoaded) {
        console.log("[Fiinny] Using Local Brain 🧠");
        return await generateWebLLMResponse(messagesWithMemory, contextData, isPremium, setPendingAction);
    }

    // 3. Fallback to Simulated Brain
    console.log("[Fiinny] Using Simulated Brain 🤖");
    return await generateSimulatedResponse(messagesWithMemory, contextData, isPremium, setPendingAction);
};

// Helper: Extract period from query
const extractPeriod = (query: string): string => {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    for (const m of months) {
        if (query.includes(m)) return m; // e.g. "nov"
    }
    if (query.includes("last month")) return "last month";
    if (query.includes("this year")) return "this year";
    if (query.includes("202")) {
        const match = query.match(/202\d/);
        return match ? match[0] : "this month";
    }
    return "this month";
};

// Helper: Extract specific date from query
const extractDate = (query: string): string | null => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.setDate(now.getDate() - 1)).toISOString().split('T')[0];

    // Handle relative days
    if (query.includes("today")) return today;
    if (query.includes("yesterday")) return yesterday;

    // Handle days of week (simple logic: find previous occurrence)
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < days.length; i++) {
        if (query.includes(days[i])) {
            const targetDay = i;
            const currentDay = new Date().getDay();
            let diff = currentDay - targetDay;
            if (diff < 0) diff += 7; // Go back to previous week if needed, or just previous occurrence
            if (diff === 0 && !query.includes("today")) diff = 7; // If today is Monday and user says "Monday", assume last Monday unless "today"

            const d = new Date();
            d.setDate(d.getDate() - diff);
            return d.toISOString().split('T')[0];
        }
    }

    // Matches "2nd nov", "nov 2", "2024-11-02", "2/11/2024"
    const dateRegex = /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?)|(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/i;
    const match = query.match(dateRegex);
    return match ? match[0] : null;
};

// ... (Existing Simulated Logic) ...
const generateSimulatedResponse = async (
    messages: Message[],
    contextData: any,
    isPremium: boolean,
    setPendingAction?: (action: PendingAction | null) => void
): Promise<Message> => {
    const lastMessage = messages[messages.length - 1];
    const query = lastMessage.content.toLowerCase();

    // 1. Intent Recognition (Simulated "Brain")
    let toolToCall: string | null = null;
    let toolArgs: any = {};

    // Helper to find category in query
    const findCategory = (text: string): string | null => {
        const categories = ["travel", "food", "entertainment", "shopping", "bills", "utilities", "rent", "emi", "salary", "investment", "apple", "coffee", "groceries"];
        for (const cat of categories) {
            if (text.includes(cat)) return cat;
        }
        return null;
    };

    const categoryInQuery = findCategory(query);
    const specificDate = extractDate(query);
    const lowerQuery = query.toLowerCase();

    // PHASE 1 UPGRADE: Use SmartParser for Natural Language Transactions (High Priority)
    // This handles "Lunch 200", "Spent 50 on Coffee", "Salary 50k" etc.
    const nlpResult = SmartParser.parseNaturalLanguage(lastMessage.content);

    // We only use NLP result if it's an 'ADD' intent or strictly looks like a transaction
    // (SmartParser is aggressive, so we ensure user isn't just chatting)
    const isAddKeywords = ["add", "new", "create", "log", "record", "plus", "spent", "paid", "bought", "purchase", "income", "earned", "received", "had", "got", "ate", "drank"].some(k => lowerQuery.includes(k));
    const isPureTransaction = /^\s*([a-zA-Z\s]+)\s+(\d+)/.test(query) || /^\s*(\d+)\s+([a-zA-Z\s]+)/.test(query); // "Coffee 200" or "200 Coffee"

    if (nlpResult && (isAddKeywords || isPureTransaction) && !lowerQuery.includes("show") && !lowerQuery.includes("find") && !lowerQuery.includes("search")) {
        console.log("[Fiinny] NLP Triggered:", nlpResult);
        toolToCall = "add_transaction";
        toolArgs = {
            type: nlpResult.type,
            amount: nlpResult.amount,
            category: nlpResult.category,
            description: nlpResult.description,
            date: nlpResult.date || specificDate || new Date().toISOString().split('T')[0],
            splitWith: undefined // TODO: Add split support to SmartParser in future
        };
    }
    // INTENT: Check Duplicate (Prioritzed over create)
    else if (lowerQuery.includes("check if") || lowerQuery.includes("already added") || lowerQuery.includes("duplicate")) {
        // This is a complex query. We should search first.
        toolToCall = "get_recent_transactions";
        const amountMatch = query.match(/(\d+)/);
        toolArgs = {
            limit: 5,
            type: 'expense' // Default to expense search
        };
    }
    // FALLBACK INTENT: Manual Regex (Legacy - keep for edge cases SmartParser misses)
    else if ((isAddKeywords) && !lowerQuery.includes("show")) {
        // ... Keep existing logic or rely on SmartParser?
        // SmartParser should cover most, but let's keep a simplified fallback if SmartParser returned null
        // Actually, if SmartParser returned null, it means no Amount found.
        // If no amount found, we can't add anyway.
    }
    // PREMIUM FEATURE: Deep Category Analysis / Highest Expense
    else if (categoryInQuery || query.includes("category") || query.includes("breakdown") || query.includes("highest") || query.includes("most")) {
        if (!isPremium) {
            // BLOCK: Free users can't see deep breakdowns
            await new Promise(resolve => setTimeout(resolve, 600));
            return {
                id: Date.now().toString(),
                role: "assistant",
                content: "I'd love to dig into your category details, but that's a **Premium** feature! 💎\n\nUpgrade to **Fiinny Premium** to unlock deep spending analysis, trends, and personalized advice.",
                timestamp: new Date()
            };
        }

        toolToCall = "get_category_breakdown";
        toolArgs = { period: extractPeriod(query) };
    }
    // BASIC FEATURE: Spending Summary / Financial Health
    else if (query.includes("spend") || query.includes("expense") || query.includes("cost") || query.includes("income") || query.includes("earn") || query.includes("save") || query.includes("doing") || query.includes("health") || query.includes("loan")) {
        toolToCall = "get_spending_summary";
        toolArgs = { period: extractPeriod(query) };
    }
    // GOAL TRACKING (Simulated)
    else if (query.includes("goal") || query.includes("target")) {
        // Mock a tool call or handle directly. Ideally we'd have a 'get_goals' tool.
        // For now, let's just pretend we called a tool and return a comprehensive response
        // accessing the profile data directly in the response generation phase.
        // But to pass data to response generation, we might need to 'mock' a tool result?
        // Actually, we can just return the message directly here if we want, OR use a dummy tool.
        // Let's use 'update_financial_profile' as a proxy if we want to *set* goals, 
        // but for *reading* goals, let's just fall through to a custom response block?
        // Easier: Just return a direct response object here for the Simulated Brain 
        // without pretending to call a tool, since we have contextData.

        await new Promise(resolve => setTimeout(resolve, 600));
        const goals = contextData.profile?.financialGoals || [];

        if (goals.length === 0) {
            return {
                id: Date.now().toString(),
                role: "assistant",
                content: "You haven't set any financial goals yet! 🎯\n\nTry saying: \"My goal is to buy a car\" or \"I want to save for a trip\".",
                timestamp: new Date()
            };
        } else {
            return {
                id: Date.now().toString(),
                role: "assistant",
                content: `Here are your current goals: 🎯\n\n${goals.map((g: string) => `- **${g}**`).join("\n")}\n\nTo check if you're on track, I need to know your target amount and date. (Goal Tracking V2 coming soon!)`,
                timestamp: new Date()
            };
        }
    }
    // BASIC FEATURE: Recent Transactions OR Specific Date Transactions
    else if (query.includes("recent") || query.includes("show") || query.includes("list") || query.includes("what") || specificDate) {
        toolToCall = "get_recent_transactions";
        toolArgs = { limit: specificDate ? 20 : 5, date: specificDate };
    }

    // 2. Tool Execution (The "Nervous System")
    let toolResult = null;
    if (toolToCall) {
        const tool = TOOLS[toolToCall];
        if (tool) {
            console.log(`[Fiinny] Calling tool: ${toolToCall}`, toolArgs);
            // Inject setPendingAction into context
            toolResult = await tool.execute(toolArgs, { ...contextData, setPendingAction });
        }
    }

    // 3. Response Generation (The "Voice")
    let responseText = "";

    if (toolResult) {
        // Generate response based on tool result
        if (toolToCall === "add_transaction") {
            const { type, amount, category } = toolArgs; // Use args from intent detection
            const debugUser = contextData.userId ? `(Debug: ${contextData.userId})` : "(Debug: No User)";
            responseText = `I've drafted a **${type || 'transaction'}** of **${amount}** for **${category || 'Uncategorized'}**. Does this look correct to you? ${debugUser}`;
        }
        else if (toolToCall === "get_spending_summary") {
            const { totalIncome, totalExpense, savings, period } = toolResult;
            const savingsRateVal = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0;
            const savingsRate = savingsRateVal.toFixed(1) + "%";

            if (totalExpense === 0 && totalIncome === 0) {
                responseText = `I couldn't find any data for **${period}**. Are you sure you have transactions for that time? 🤔`;
            } else {
                // ADVICE LOGIC (For "Should I take a loan?" etc)
                if (query.includes("loan") || query.includes("health") || query.includes("doing")) {
                    if (!isPremium) {
                        responseText = `Summary for **${period}**:\n` +
                            `- Spent: ₹${totalExpense.toLocaleString()}\n` +
                            `- Earned: ₹${totalIncome.toLocaleString()}\n` +
                            `- Savings: ₹${savings.toLocaleString()}\n\n` +
                            `Upgrade to Premium for personalized financial advice! 💎`;
                    } else {
                        // Premium Advice
                        let advice = "";
                        if (savingsRateVal < 0) {
                            advice = "🚨 **Critical Alert**: You are spending more than you earn. Taking a loan right now would be risky unless it's for an emergency. Focus on cutting costs first.";
                        } else if (savingsRateVal < 20) {
                            advice = "⚠️ **Caution**: You're saving, but less than the recommended 20%. I'd avoid new debt if possible. Try to boost that savings rate!";
                        } else {
                            advice = "✅ **Healthy**: Your finances look strong! If you need a loan for an asset (like a home), you're in a good position. Just check the interest rates.";
                        }

                        responseText = `Here's your financial health check for **${period}**:\n\n` +
                            `💸 **Spent:** ₹${totalExpense.toLocaleString()}\n` +
                            `💰 **Earned:** ₹${totalIncome.toLocaleString()}\n` +
                            `📉 **Savings Rate:** ${savingsRate}\n\n` +
                            advice;
                    }
                } else {
                    // Standard Summary
                    if (isPremium) {
                        responseText = `Here's your summary for **${period}**:\n\n` +
                            `💸 **Spent:** ₹${totalExpense.toLocaleString()}\n` +
                            `💰 **Earned:** ₹${totalIncome.toLocaleString()}\n` +
                            `📉 **Savings:** ₹${savings.toLocaleString()} (${savingsRate})\n\n` +
                            (savings > 0 ? "You're in the green! Great job keeping expenses in check. 🚀" : "Looks like expenses were higher than income. Let's try to cut back a bit next month! 💪");
                    } else {
                        responseText = `Summary for **${period}**:\n` +
                            `- Spent: ₹${totalExpense.toLocaleString()}\n` +
                            `- Earned: ₹${totalIncome.toLocaleString()}\n` +
                            `- Savings: ₹${savings.toLocaleString()}\n\n` +
                            `Upgrade to Premium for personalized insights! 💎`;
                    }
                }
            }
        } else if (toolToCall === "get_category_breakdown") {
            // Only reachable by Premium users due to check above
            const { breakdown, period } = toolResult;
            const categories = Object.entries(breakdown);

            if (categories.length === 0) {
                responseText = `No spending data found for **${period}**.`;
            } else {
                // Handle specific category query (e.g. "Travel expenses")
                if (categoryInQuery && !query.includes("highest") && !query.includes("most")) {
                    // @ts-ignore
                    const catData = categories.find(c => c[0].toLowerCase().includes(categoryInQuery));
                    if (catData) {
                        // @ts-ignore
                        responseText = `You spent **₹${catData[1].toLocaleString()}** on **${catData[0]}** in ${period}. 💸`;
                        // Add witty comment based on category
                        if (categoryInQuery === "travel") responseText += "\n\nHope it was a good trip! ✈️";
                        if (categoryInQuery === "food") responseText += "\n\nYum! 🍔";
                    } else {
                        responseText = `I didn't find any spending specifically for **${categoryInQuery}** in ${period}.`;
                    }
                } else {
                    // General breakdown OR Highest
                    const top = categories[0];
                    // @ts-ignore
                    const topName = top[0]; const topAmount = top[1] as number;

                    if (query.includes("highest") || query.includes("most")) {
                        responseText = `For **${period}**, your highest spend was on **${topName}** (₹${topAmount.toLocaleString()}). 🚨`;
                    } else {
                        responseText = `For **${period}**, your highest spend was on **${topName}** (₹${topAmount.toLocaleString()}). 🍔\n\n` +
                            `Here's the breakdown:\n` +
                            // @ts-ignore
                            categories.slice(0, 5).map(([cat, amt]) => `- **${cat}**: ₹${(amt as number).toLocaleString()}`).join("\n");
                    }
                }
            }
        } else if (toolToCall === "get_recent_transactions") {
            const txs = toolResult;
            if (txs.length === 0) {
                responseText = specificDate
                    ? `I didn't find any transactions on **${specificDate}**.`
                    : "I didn't find any recent transactions.";
            } else {
                const header = specificDate
                    ? `Here are your transactions for **${specificDate}**:\n\n`
                    : "Here are your latest transactions:\n\n";

                responseText = header +
                    // @ts-ignore
                    txs.map(t => `- **${t.category}**: ₹${t.amount.toLocaleString()} (${t.date})`).join("\n");
            }
        }
    } else {
        // Fallback / Chit-chat
        if (query.includes("who are you")) {
            responseText = isPremium
                ? "I'm **Fiinny**, your personal financial wellness coach! 🎩\n\nI'm here to help you track expenses, analyze habits, and reach 'Financial Antigravity'. Ask me anything about your money!"
                : "I'm Fiinny, your finance assistant. I can help you track expenses and income.";
        } else if (query.includes("hello") || query.includes("hi")) {
            responseText = isPremium
                ? "Hey there! 👋 Ready to crush your financial goals today?"
                : "Hello. How can I help you with your finances today?";
        } else {
            // MEMORY CHECK IN SIMULATION
            // Even in simulation, we can show we remembered something
            if (lastMessage.content.includes("[RELEVANT MEMORIES]")) {
                const memoryText = lastMessage.content.split("[RELEVANT MEMORIES]:")[1];
                responseText = `I remember you mentioned:\n${memoryText}\n\nBased on that, how can I help?`;
            } else {
                responseText = "I'm not sure I understand that yet. Try asking:\n\n- \"How much did I spend last month?\"\n- \"Show recent transactions\"";
            }
        }
    }

    // Simulate "Thinking" delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
        id: Date.now().toString(),
        role: "assistant",
        content: responseText,
        timestamp: new Date()
    };
};
