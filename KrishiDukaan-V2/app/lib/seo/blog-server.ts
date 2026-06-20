/**
 * Server-only blog data layer for SEO SSR pages (/blog, /blog/[slug]).
 *
 * Mirrors app/lib/seo/products-server.ts: uses the server-safe Firebase access
 * pattern (getClientDb() + firebase/firestore/lite over HTTP REST) so it runs in
 * Next.js server components without Application Default Credentials. This module
 * is READ-ONLY and deliberately does NOT import the client app/firebase.ts
 * bundle (which uses the full gRPC SDK and is meant for the browser).
 *
 * Public read access is permitted by firestore.rules:
 *   match /blogPosts/{postId} { allow read: if true; }
 */

import { collection, getDocs, query, where } from "firebase/firestore/lite";
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

function str(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

function mapPost(id: string, data: Record<string, unknown>): SeoBlogPost {
  return {
    id,
    title: str(data.title),
    slug: str(data.slug),
    excerpt: str(data.excerpt),
    content: str(data.content),
    coverImage: data.coverImage ? str(data.coverImage) : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    author: str(data.author, "KrishiDukaan"),
    status: data.status === "published" ? "published" : "draft",
    readTime: typeof data.readTime === "number" ? data.readTime : undefined,
    publishedAt: data.publishedAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

// Firestore Timestamp | Date | string → epoch ms (for sorting); 0 on failure.
function toMillis(value: unknown): number {
  try {
    const d = (value as { toDate?: () => Date })?.toDate?.();
    if (d instanceof Date && !isNaN(d.getTime())) return d.getTime();
    if (value) {
      const parsed = new Date(value as string);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/** Firestore Timestamp | Date | string → ISO 8601 string, or undefined. For JSON-LD / OG. */
export function toIso(value: unknown): string | undefined {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : undefined;
}

// ─── Slug helpers ───────────────────────────────────────────────────────────
// Mirrors the normalization in app/firebase.ts so server-side resolution matches
// the client fetchers and the slugs the listing page links to.

function decodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

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

// ─── Fetchers (each returns null/[] on failure — never throws) ──────────────

/**
 * All published posts, newest first. Filters only by status (no orderBy) so
 * posts missing `publishedAt` are not silently dropped and we avoid a
 * composite-index dependency; ordering is applied in memory.
 */
export async function getPublishedPosts(): Promise<SeoBlogPost[]> {
  try {
    const db = getClientDb();
    const snap = await getDocs(
      query(collection(db, "blogPosts"), where("status", "==", "published")),
    );
    return snap.docs
      .map((d) => mapPost(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => toMillis(b.publishedAt) - toMillis(a.publishedAt));
  } catch (err) {
    console.warn("[seo/blog-server] getPublishedPosts failed:", err);
    return [];
  }
}

/** A single published post by slug (mirrors the client candidate-matching). null if not found. */
export async function getPostBySlug(slug: string): Promise<SeoBlogPost | null> {
  try {
    const db = getClientDb();
    const decoded = decodeSlug(slug);
    const candidates = Array.from(
      new Set(
        [slug, decoded, normalizeBlogSlug(slug), encodeURIComponent(decoded)].filter(
          Boolean,
        ),
      ),
    );

    for (const candidate of candidates) {
      const snap = await getDocs(
        query(collection(db, "blogPosts"), where("slug", "==", candidate)),
      );
      const match = snap.docs.find(
        (d) => (d.data() as Record<string, unknown>).status === "published",
      );
      if (match) return mapPost(match.id, match.data() as Record<string, unknown>);
    }

    // Fallback: normalized comparison across all published posts.
    const normalized = normalizeBlogSlug(slug);
    const all = await getPublishedPosts();
    return all.find((p) => normalizeBlogSlug(p.slug || p.title) === normalized) ?? null;
  } catch (err) {
    console.warn("[seo/blog-server] getPostBySlug failed:", err);
    return null;
  }
}

/** Up to `max` published posts sharing a tag with `post` (excludes itself). */
export function relatedPosts(
  post: SeoBlogPost,
  all: SeoBlogPost[],
  max = 3,
): SeoBlogPost[] {
  return all
    .filter((a) => a.id !== post.id && a.tags?.some((t) => post.tags?.includes(t)))
    .slice(0, max);
}
