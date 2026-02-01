import { db, storage } from "@/lib/firebase";
import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    setDoc,
    DocumentData
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export interface BlogPost {
    id?: string;
    slug: string;
    title: string;
    excerpt: string;
    content: string; // HTML content
    coverImage?: string;
    author: string;
    date: string; // Display date string e.g. "December 27, 2025"
    readTime: string;
    categories: string[];

    // SEO Fields
    seoTitle?: string;
    seoDescription?: string;
    keywords?: string[];

    // Internal
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    published?: boolean;
}

const BLOG_COLLECTION = "posts";

export const BlogService = {
    // Get all posts (ordered by creation time, newest first)
    async getPosts(): Promise<BlogPost[]> {
        try {
            const q = query(collection(db, BLOG_COLLECTION), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as BlogPost));
        } catch (error) {
            console.error("Error fetching posts:", error);
            return [];
        }
    },

    // Get single post by ID
    async getPostById(id: string): Promise<BlogPost | null> {
        try {
            const docRef = doc(db, BLOG_COLLECTION, id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() } as BlogPost;
            }
            return null;
        } catch (error) {
            console.error("Error fetching post by ID:", error);
            return null;
        }
    },

    // Get single post by slug (for public view)
    async getPostBySlug(slug: string): Promise<BlogPost | null> {
        try {
            const q = query(collection(db, BLOG_COLLECTION), where("slug", "==", slug));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) return null;
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() } as BlogPost;
        } catch (error) {
            console.error("Error fetching post by slug:", error);
            return null;
        }
    },

    // Create Post
    async createPost(post: Omit<BlogPost, 'id' | 'createdAt'>): Promise<string> {
        const docRef = await addDoc(collection(db, BLOG_COLLECTION), {
            ...post,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });
        return docRef.id;
    },

    // Update Post
    async updatePost(id: string, post: Partial<BlogPost>): Promise<void> {
        const docRef = doc(db, BLOG_COLLECTION, id);
        const updateData = {
            ...post,
            updatedAt: Timestamp.now()
        };
        // prevent overwriting createdAt if passed by mistake, though Partial handles it.
        delete (updateData as any).createdAt;

        await updateDoc(docRef, updateData);
    },

    // Delete Post
    async deletePost(id: string): Promise<void> {
        await deleteDoc(doc(db, BLOG_COLLECTION, id));
    },

    // Upload Image
    async uploadImage(file: File, path: string = "blog_images"): Promise<string> {
        try {
            const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            return await getDownloadURL(storageRef);
        } catch (error) {
            console.error("Error uploading image:", error);
            throw error;
        }
    }
};
