export interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    functionName: string;
    args: any;
    result?: any;
}

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: "object";
        properties: Record<string, any>;
        required: string[];
    };
    execute: (args: any, context: any) => Promise<any>;
}

export interface SystemPrompt {
    role: string;
    tone: string;
    capabilities: string[];
    rules: string[];
    content: string; // The full compiled prompt
}
