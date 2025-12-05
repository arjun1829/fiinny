import Tesseract from 'tesseract.js';
import { generateResponse } from './llm_service';
import { Message } from './ai_types';

// 1. OCR: Extract Text from Image
export const recognizeImage = async (
    imageFile: File,
    onProgress: (progress: number) => void
): Promise<string> => {
    console.log("[Vision] Starting OCR...");
    const result = await Tesseract.recognize(
        imageFile,
        'eng',
        {
            logger: m => {
                if (m.status === 'recognizing text') {
                    onProgress(m.progress * 100);
                }
            }
        }
    );
    console.log("[Vision] OCR Complete:", result.data.text);
    return result.data.text;
};

// 2. Parsing: Use LLM to understand the receipt
export const parseReceipt = async (
    ocrText: string,
    isPremium: boolean,
    isModelLoaded: boolean
): Promise<{ merchant: string; amount: number; category: string; summary: string }> => {

    const prompt = `
    I have scanned a receipt. Here is the raw text:
    """
    ${ocrText}
    """
    
    Please extract the following:
    1. Merchant Name
    2. Total Amount
    3. Category (Food, Travel, Shopping, Bills, Entertainment, Health, Transport)
    
    Return the result as a JSON string ONLY, like this:
    { "merchant": "Starbucks", "amount": 5.50, "category": "Food", "summary": "I found a receipt from Starbucks for $5.50." }
    `;

    // We create a temporary message history for this "internal thought"
    const messages: Message[] = [{
        id: "vision-task",
        role: "user",
        content: prompt,
        timestamp: new Date()
    }];

    // Call the Brain (Local or Simulated)
    const response = await generateResponse(messages, {}, isPremium, isModelLoaded);
    const content = response.content;

    try {
        // Try to parse JSON from the response
        // Llama-3 might add extra text, so we look for the JSON block
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("No JSON found");
        }
    } catch (e) {
        console.error("Failed to parse receipt JSON:", e);
        return {
            merchant: "Unknown",
            amount: 0,
            category: "Uncategorized",
            summary: "I read the receipt, but I couldn't quite figure out the details. Here's what I saw:\n\n" + ocrText.slice(0, 100) + "..."
        };
    }
};
