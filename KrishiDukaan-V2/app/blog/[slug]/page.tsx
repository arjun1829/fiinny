import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getPostBySlug,
  getPublishedPosts,
  relatedPosts,
  toIso,
} from "../../lib/seo/blog-server";

// Incremental Static Regeneration — cached at the edge, refreshed hourly.
export const revalidate = 3600;
export const dynamicParams = true;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(ts: unknown): string {
  try {
    const d = (ts as any)?.toDate?.() ?? new Date(ts as string);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) {
    return {
      title: "Post Not Found | KrishiDukan",
      robots: { index: false, follow: false },
    };
  }

  const canonicalPath = `/blog/${post.slug}`;
  const description =
    post.excerpt ||
    `${post.title} — farming insights and agri-retail tips from the KrishiDukan team.`;
  const images = post.coverImage ? [post.coverImage] : ["/images/og-default.png"];
  const published = toIso(post.publishedAt);
  const modified = toIso(post.updatedAt ?? post.publishedAt);

  return {
    // Absolute title opts out of the root "%s | KrishiDukan" template so the
    // tab/title text stays exactly as before (no double brand suffix).
    title: { absolute: `${post.title} — KrishiDukaan Blog` },
    description: description.slice(0, 320),
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "article",
      title: post.title,
      description: description.slice(0, 320),
      url: `${SITE_URL}${canonicalPath}`,
      siteName: "KrishiDukan",
      images,
      ...(published ? { publishedTime: published } : {}),
      ...(modified ? { modifiedTime: modified } : {}),
      ...(post.author ? { authors: [post.author] } : {}),
      ...(post.tags?.length ? { tags: post.tags } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: description.slice(0, 200),
      images,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  // Fetched in parallel; getPublishedPosts feeds the "Related Articles" section.
  const [post, all] = await Promise.all([getPostBySlug(slug), getPublishedPosts()]);
  if (!post) notFound();

  const related = relatedPosts(post, all, 3);
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;
  const ogImage = post.coverImage || `${SITE_URL}/images/og-default.png`;
  const published = toIso(post.publishedAt);
  const modified = toIso(post.updatedAt ?? post.publishedAt);
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(`${post.title} — ${canonicalUrl}`)}`;

  // ── JSON-LD: BlogPosting ──
  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || post.title,
    image: ogImage,
    author: { "@type": "Person", name: post.author || "KrishiDukaan" },
    publisher: {
      "@type": "Organization",
      name: "KrishiDukan",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/images/krishidukan%20icon.webp`,
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    ...(post.tags?.length ? { keywords: post.tags.join(", ") } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
  };

  // ── JSON-LD: BreadcrumbList ──
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "KrishiDukan", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title },
    ],
  };

  return (
    <div className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* Cover */}
      {post.coverImage ? (
        <div className="w-full h-64 md:h-96 overflow-hidden bg-surface-container-low">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full h-32 bg-[#0d2b09]" />
      )}

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-on-surface-variant font-semibold mb-6">
          <Link href="/" className="hover:text-primary transition-colors">KrishiDukaan</Link>
          <span>›</span>
          <Link href="/blog" className="hover:text-primary transition-colors">Blog</Link>
          <span>›</span>
          <span className="text-primary truncate max-w-[200px]">{post.title}</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(post.tags || []).map(t => (
            <span key={t} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest border border-primary/20">
              {t}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-black text-on-surface leading-tight mb-4">{post.title}</h1>

        {/* Meta */}
        <div className="flex items-center gap-3 text-sm text-on-surface-variant font-semibold mb-2 flex-wrap">
          <span>By {post.author}</span>
          <span>·</span>
          <time>{formatDate(post.publishedAt)}</time>
          {post.readTime && <><span>·</span><span>{post.readTime} min read</span></>}
        </div>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-base md:text-lg text-on-surface-variant italic border-l-4 border-primary/40 pl-4 py-1 mb-8 bg-primary/5 rounded-r-xl">
            {post.excerpt}
          </p>
        )}

        {/* Body */}
        <article
          className="blog-content text-on-surface leading-relaxed"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Share / back */}
        <div className="mt-12 pt-8 border-t border-surface-container flex items-center justify-between flex-wrap gap-4">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            ← Back to Blog
          </Link>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-bold bg-green-600 text-white px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Share on WhatsApp
          </a>
        </div>
      </div>

      {/* Related posts */}
      {related.length > 0 && (
        <div className="bg-surface-container-low border-t border-surface-container py-12">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-xl font-black text-on-surface mb-6">Related Articles</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map(r => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group block rounded-2xl border border-surface-container bg-white p-5 hover:shadow-md transition-shadow">
                  <h3 className="font-black text-on-surface mb-2 group-hover:text-primary transition-colors line-clamp-2">{r.title}</h3>
                  <p className="text-sm text-on-surface-variant line-clamp-2">{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .blog-content h1 { font-size: 2rem; font-weight: 900; margin: 1.5rem 0 0.75rem; line-height: 1.2; }
        .blog-content h2 { font-size: 1.5rem; font-weight: 800; margin: 1.5rem 0 0.75rem; line-height: 1.3; }
        .blog-content h3 { font-size: 1.2rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
        .blog-content p { margin-bottom: 1rem; }
        .blog-content ul { list-style: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
        .blog-content ol { list-style: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
        .blog-content li { margin-bottom: 0.4rem; }
        .blog-content strong { font-weight: 700; }
        .blog-content em { font-style: italic; }
        .blog-content blockquote { border-left: 4px solid var(--color-primary, #2e7d32); padding: 0.75rem 1rem; background: rgba(46,125,50,0.06); border-radius: 0 0.75rem 0.75rem 0; margin: 1.25rem 0; font-style: italic; }
        .blog-content a { color: var(--color-primary, #2e7d32); text-decoration: underline; }
        .blog-content img { max-width: 100%; border-radius: 1rem; margin: 1rem 0; }
        .blog-content hr { border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; }
      `}</style>
    </div>
  );
}
