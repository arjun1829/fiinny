/**
 * Server-only blog data layer for SSR blog pages (/blog/[slug]).
 *
 * Mirrors the slug-resolution logic of fetchBlogPostBySlug() in app/firebase.ts,
 * but uses the server-safe access pattern (getClientDb() + firebase/firestore/lite
 * over HTTP REST) — the same approach already used by app/sitemap.ts for blogPosts.
 *
 * READ-ONLY. Public read is permitted by firestore.rules:
 *   match /blogPosts/{postId} { allow read: if true; }
 */

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore/lite";
import { getClientDb } from "../firebase-client-server";

export interface SeoBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  tags: string[];
  author: string;
  status: "draft" | "published";
  readTime?: number;
  publishedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Identical normalization to app/firebase.ts so Marathi / encoded slugs resolve.
function normalizeBlogSlug(value: string): string {
  return decodeSlug(value)
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9ऀ-ॿ\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapPost(id: string, data: Record<string, unknown>): SeoBlogPost {
  return {
    id,
    title: String(data.title ?? ""),
    slug: String(data.slug ?? ""),
    excerpt: String(data.excerpt ?? ""),
    content: String(data.content ?? ""),
    coverImage: data.coverImage ? String(data.coverImage) : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    author: String(data.author ?? ""),
    status: data.status === "draft" ? "draft" : "published",
    readTime: typeof data.readTime === "number" ? data.readTime : undefined,
    publishedAt: data.publishedAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

/** All published posts (used for related-posts + slug fallback). [] on failure. */
export async function getPublishedPosts(): Promise<SeoBlogPost[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(collection(db, "blogPosts"), where("status", "==", "published")),
    );
    return snap.docs.map((d) => mapPost(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.warn("[seo/blog-server] getPublishedPosts failed:", err);
    return [];
  }
}

/**
 * Resolve a published post by slug using the same multi-candidate strategy as
 * the client fetcher. Returns null if not found or on failure (never throws).
 */
export async function getPublishedPostBySlug(
  slug: string,
): Promise<SeoBlogPost | null> {
  try {
    const db = getClientDb();
    const decodedSlug = decodeSlug(slug);
    const candidates = Array.from(
      new Set(
        [slug, decodedSlug, normalizeBlogSlug(slug), encodeURIComponent(decodedSlug)].filter(
          Boolean,
        ),
      ),
    );

    for (const candidate of candidates) {
      const snap = await getDocs(
        query(collection(db, "blogPosts"), where("slug", "==", candidate)),
      );
      const docSnap = snap.docs.find(
        (d) => (d.data() as Record<string, unknown>).status === "published",
      );
      if (docSnap) return mapPost(docSnap.id, docSnap.data() as Record<string, unknown>);
    }

    // Fallback: normalized comparison across all published posts.
    const all = await getPublishedPosts();
    const normalizedSlug = normalizeBlogSlug(slug);
    return (
      all.find(
        (post) => normalizeBlogSlug(post.slug || post.title) === normalizedSlug,
      ) ?? null
    );
  } catch (err) {
    console.warn("[seo/blog-server] getPublishedPostBySlug failed:", err);
    return null;
  }
}

/** Firestore Timestamp | Date | string → ISO string, or undefined. */
export function toIso(value: unknown): string | undefined {
  try {
    const d = (value as { toDate?: () => Date })?.toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
    if (value) {
      const parsed = new Date(value as string);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
