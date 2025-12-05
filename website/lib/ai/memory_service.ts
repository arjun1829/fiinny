// import { pipeline } from "@xenova/transformers";

// Define Memory Interface
export interface Memory {
    id: string;
    text: string;
    embedding: number[];
    timestamp: number;
}

const DB_NAME = "FiinnyMemoryDB";
const STORE_NAME = "memories";
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let extractor: any = null;

// Initialize Embedding Pipeline
export const initMemory = async () => {
    if (!extractor) {
        console.log("[Memory] Loading embedding model...");
        // Dynamic import to avoid SSR/Build issues with Transformers.js
        const { pipeline } = await import("@xenova/transformers");
        extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, {
            quantized: true,
        });
        console.log("[Memory] Model loaded.");
    }
    await initDB();
};

// Initialize IndexedDB
const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
};

// Generate Embedding
const getEmbedding = async (text: string): Promise<number[]> => {
    if (!extractor) await initMemory();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
};

// Store Memory
export const remember = async (text: string) => {
    const embedding = await getEmbedding(text);
    const memory: Memory = {
        id: Date.now().toString(),
        text,
        embedding,
        timestamp: Date.now()
    };

    const db = await initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add(memory);
    console.log(`[Memory] Stored: "${text}"`);
};

// Cosine Similarity
const cosineSimilarity = (a: number[], b: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Recall Memories
export const recall = async (query: string, limit: number = 3): Promise<string[]> => {
    const queryEmbedding = await getEmbedding(query);
    const db = await initDB();

    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const memories: Memory[] = request.result;

            // Calculate scores
            const scored = memories.map(mem => ({
                text: mem.text,
                score: cosineSimilarity(queryEmbedding, mem.embedding)
            }));

            // Sort and filter
            const results = scored
                .filter(m => m.score > 0.4) // Similarity threshold
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(m => m.text);

            console.log(`[Memory] Recalled for "${query}":`, results);
            resolve(results);
        };
    });
};
