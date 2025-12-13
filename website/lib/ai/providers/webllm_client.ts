import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";
import { Message } from "../ai_types";
import { PendingAction } from "../action_service";
import { TOOLS } from "../tools";
import { getSystemPrompt } from "../system_prompt";

// We use a lightweight but capable model (~550MB) - The "Silent Edge"
const SELECTED_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

let engine: MLCEngine | null = null;

export const initializeWebLLM = async (
    onProgress: (progress: string) => void
) => {
    if (engine) return;

    const initProgressCallback: InitProgressCallback = (report) => {
        onProgress(report.text);
    };

    engine = await CreateMLCEngine(
        SELECTED_MODEL,
        { initProgressCallback: initProgressCallback }
    );
};

export const isWebLLMLoaded = () => !!engine;

export const generateWebLLMResponse = async (
    messages: Message[],
    contextData: any,
    isPremium: boolean,
    setPendingAction?: (action: PendingAction | null) => void
): Promise<Message> => {
    if (!engine) {
        throw new Error("Engine not initialized");
    }

    // Convert tools to OpenAI format for WebLLM
    const tools = Object.values(TOOLS).map(tool => ({
        type: "function" as const,
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
        }
    }));

    const systemMessage = { role: "system" as const, content: getSystemPrompt() };
    const conversation = [
        systemMessage,
        ...messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content
        }))
    ];

    try {
        const reply = await engine.chat.completions.create({
            messages: conversation,
            // @ts-ignore - WebLLM types might be slightly different but it supports tools
            tools: tools,
            tool_choice: "auto"
        });

        const choice = reply.choices[0];
        const message = choice.message;

        // Handle Tool Calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            console.log(`[WebLLM] Calling tool: ${toolName}`, toolArgs);

            // Execute Tool
            const tool = TOOLS[toolName];
            let functionResponse = "Tool not found";

            if (tool) {
                // Check Premium Limits
                if (toolName === "get_category_breakdown" && !isPremium) {
                    functionResponse = "PREMIUM_FEATURE_LOCKED: This feature requires Fiinny Premium.";
                } else {
                    try {
                        // @ts-ignore
                        const result = await tool.execute(toolArgs, { ...contextData, setPendingAction });
                        functionResponse = JSON.stringify(result);
                    } catch (e: any) {
                        functionResponse = `Error: ${e.message}`;
                    }
                }
            }

            // Feed tool result back to model
            // @ts-ignore
            conversation.push(message);
            conversation.push({
                // @ts-ignore
                role: "tool",
                content: functionResponse,
                tool_call_id: toolCall.id
            });

            const finalReply = await engine.chat.completions.create({
                messages: conversation
            });

            return {
                id: Date.now().toString(),
                role: "assistant",
                content: finalReply.choices[0].message.content || "I'm speechless!",
                timestamp: new Date()
            };
        }

        return {
            id: Date.now().toString(),
            role: "assistant",
            content: message.content || "I'm speechless!",
            timestamp: new Date()
        };

    } catch (error: any) {
        console.error("WebLLM Error:", error);
        return {
            id: Date.now().toString(),
            role: "assistant",
            content: `My local brain hiccuped. 😵‍💫 Error: ${error.message || error}`,
            timestamp: new Date()
        };
    }
};
