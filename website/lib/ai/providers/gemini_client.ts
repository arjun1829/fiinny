import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { Message, Tool } from "../ai_types";
import { TOOLS } from "../tools";
import { getSystemPrompt } from "../system_prompt";

export const callGemini = async (
    messages: Message[],
    contextData: any,
    apiKey: string,
    isPremium: boolean
): Promise<Message> => {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Convert our tools to Gemini format
    const toolsConfig = {
        functionDeclarations: Object.values(TOOLS).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }))
    };

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: getSystemPrompt(),
        tools: [toolsConfig as any]
    });

    const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        })),
        generationConfig: {
            maxOutputTokens: 1000,
        }
    });

    const lastMessage = messages[messages.length - 1];

    // Inject context data into the prompt if needed, or rely on tools.
    // Ideally, we let the model ask for data via tools.
    // But for "contextData" that is already loaded (like current view), we can prepend it.
    // For now, we'll rely on the model calling tools to get data.

    try {
        const result = await chat.sendMessage(lastMessage.content);
        const response = await result.response;
        const call = response.functionCalls();

        if (call && call.length > 0) {
            // Handle Function Calls
            const functionCalls = call;
            const toolParts = [];

            for (const fc of functionCalls) {
                const toolName = fc.name;
                const toolArgs = fc.args;

                console.log(`[Gemini] Calling tool: ${toolName}`, toolArgs);

                // Execute Tool
                const tool = TOOLS[toolName];
                let functionResponse: any = { error: "Tool not found" };

                if (tool) {
                    // Check Premium Limits for specific tools
                    if (toolName === "get_category_breakdown" && !isPremium) {
                        functionResponse = {
                            error: "PREMIUM_FEATURE_LOCKED",
                            message: "This feature requires Fiinny Premium."
                        };
                    } else {
                        try {
                            // @ts-ignore
                            functionResponse = await tool.execute(toolArgs, contextData);
                        } catch (e: any) {
                            functionResponse = { error: e.message };
                        }
                    }
                }

                toolParts.push({
                    functionResponse: {
                        name: toolName,
                        response: functionResponse
                    }
                });
            }

            // Send tool results back to model
            const toolResult = await chat.sendMessage(toolParts);
            const finalResponse = await toolResult.response;

            return {
                id: Date.now().toString(),
                role: "assistant",
                content: finalResponse.text(),
                timestamp: new Date()
            };
        } else {
            // Normal text response
            return {
                id: Date.now().toString(),
                role: "assistant",
                content: response.text(),
                timestamp: new Date()
            };
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            id: Date.now().toString(),
            role: "assistant",
            content: "I'm having trouble connecting to Gemini right now. Please check your API Key.",
            timestamp: new Date()
        };
    }
};
