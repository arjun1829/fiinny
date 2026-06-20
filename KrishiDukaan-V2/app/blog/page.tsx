import Link from "next/link";
import { getPublishedPosts } from "../lib/seo/blog-server";

// Incremental Static Regeneration — cached at the edge, refreshed hourly.
export const revalidate = 3600;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://krishidukan.com";

function formatDate(ts: unknown): string {
  try {
    const d = (ts as any)?.toDate?.() ?? new Date(ts as string);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  } catch { return ""; }
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-block rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border border-primary/20">
      {tag}
    </span>
  );
}

export default async function BlogListPage() {
  const posts = await getPublishedPosts();
  const [featured, ...rest] = posts;

  // ── JSON-LD: Blog with a list of posts ──
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "KrishiDukan Blog",
    url: `${SITE_URL}/blog`,
    description:
      "Expert farming advice, agri-retail insights, and crop guides — written for Indian farmers and agricultural businesses.",
    blogPost: posts.slice(0, 20).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      ...(p.excerpt ? { description: p.excerpt } : {}),
      ...(p.coverImage ? { image: p.coverImage } : {}),
    })),
  };

  return (
    <div className="min-h-screen bg-surface">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />

      {/* Header */}
      <div className="bg-[#0d2b09] py-16 px-4 text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8 text-white/60 text-sm font-semibold hover:text-white transition-colors">
          ← Back to KrishiDukaan
        </Link>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
          Krishi<span className="text-[#f4a500]">Dukan</span> Blog
        </h1>
        <p className="text-white/70 max-w-xl mx-auto text-base">
          Expert farming advice, agri-retail insights, and crop guides — written for Indian farmers and agricultural businesses.
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <p className="text-xl font-bold">No posts yet</p>
            <p className="text-sm mt-2">Check back soon for farming tips and agri insights.</p>
          </div>
        ) : (
          <>
            {/* Featured post */}
            {featured && (
              <Link href={`/blog/${featured.slug}`} className="block mb-12 group">
                <div className="rounded-3xl overflow-hidden border border-surface-container bg-white shadow-ambient hover:shadow-xl transition-shadow">
                  {featured.coverImage && (
                    <div className="aspect-[16/6] overflow-hidden bg-surface-container-low">
                      <img
                        src={featured.coverImage}
                        alt={featured.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <div className="p-8">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5">
                        Featured
                      </span>
                      {(featured.tags || []).slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-on-surface mb-3 group-hover:text-primary transition-colors leading-tight">
                      {featured.title}
                    </h2>
                    <p className="text-on-surface-variant text-base mb-4 line-clamp-2">{featured.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs text-on-surface-variant font-semibold">
                      <span>{featured.author}</span>
                      <span>·</span>
                      <span>{formatDate(featured.publishedAt)}</span>
                      {featured.readTime && <><span>·</span><span>{featured.readTime} min read</span></>}
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Rest of posts */}
            {rest.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {rest.map((post) => (
                  <Link key={post.id} href={`/blog/${post.slug}`} className="group block rounded-2xl border border-surface-container bg-white shadow-ambient hover:shadow-lg transition-shadow overflow-hidden">
                    {post.coverImage ? (
                      <div className="aspect-video overflow-hidden bg-surface-container-low">
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                        <span className="text-4xl">🌿</span>
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(post.tags || []).slice(0, 2).map(t => <TagChip key={t} tag={t} />)}
                      </div>
                      <h3 className="font-black text-on-surface text-lg leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{post.excerpt}</p>
                      <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">
                        <span>{formatDate(post.publishedAt)}</span>
                        {post.readTime && <><span>·</span><span>{post.readTime} min</span></>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-surface-container text-center py-8 text-xs text-on-surface-variant">
        © {new Date().getFullYear()} KrishiDukaan · Connecting Indian farmers with verified retailers
      </div>
    </div>
  );
}
