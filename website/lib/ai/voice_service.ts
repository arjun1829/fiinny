// import { pipeline } from "@xenova/transformers";

let transcriber: any = null;

// 1. Initialize Whisper (Ears)
export const initVoice = async () => {
    if (!transcriber) {
        console.log("[Voice] Loading Whisper model...");
        // Dynamic import to avoid SSR/Build issues
        const { pipeline } = await import("@xenova/transformers");
        transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
            quantized: true,
        });
        console.log("[Voice] Whisper loaded.");
    }
};

// 2. Transcribe Audio (Microphone -> Text)
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
    if (!transcriber) await initVoice();

    // Convert Blob to Float32Array (16kHz mono) required by Whisper
    const audioData = await convertBlobToAudioData(audioBlob);

    console.log("[Voice] Transcribing...");
    const result = await transcriber(audioData);
    console.log("[Voice] Heard:", result.text);
    return result.text.trim();
};

// 3. Speak Text (Text -> Mouth)
export const speak = (text: string) => {
    if (!window.speechSynthesis) {
        console.warn("Text-to-Speech not supported in this browser.");
        return;
    }

    // Cancel any current speech
    window.speechSynthesis.cancel();

    // Clean up text (remove markdown like **bold**, emojis, etc for smoother speech)
    const cleanText = text.replace(/\*\*/g, "").replace(/#/g, "").replace(/\[.*?\]/g, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Select a nice voice if available
    const voices = window.speechSynthesis.getVoices();
    // Try to find a "Google US English" or similar natural voice
    const preferredVoice = voices.find(v => v.name.includes("Google US English")) ||
        voices.find(v => v.name.includes("Samantha")) ||
        voices.find(v => v.lang.startsWith("en"));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
};

// --- Audio Helper ---
// Converts Blob -> AudioContext -> Resample to 16kHz -> Float32Array
const convertBlobToAudioData = async (blob: Blob): Promise<Float32Array> => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Whisper expects 16kHz
    });

    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get the first channel (mono)
    const audioData = audioBuffer.getChannelData(0);
    return audioData;
};
