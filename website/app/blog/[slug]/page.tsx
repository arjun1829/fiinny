import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { BlogService, BlogPost } from "@/lib/blog-service";
import { MoveLeft, Calendar, Clock, User } from "lucide-react";
import type { Metadata } from 'next';
import Script from 'next/script'; // For JSON-LD

interface PageProps {
    params: Promise<{
        slug: string;
    }>
}

// FIX: Generate Static Params for SSG (output: export)
// This fetches all known slugs at build time.
export async function generateStaticParams() {
    try {
        const posts = await BlogService.getPosts();
        return posts.map((post) => ({
            slug: post.slug,
        }));
    } catch (e) {
        console.error("Error generating static params", e);
        return [];
    }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const post = await BlogService.getPostBySlug(slug);
        if (!post) return { title: 'Post Not Found | Fiinny' };

        return {
            title: post.seoTitle || `${post.title} | Fiinny Blog`,
            description: post.seoDescription || post.excerpt,
            openGraph: post.coverImage ? {
                images: [post.coverImage],
            } : undefined
        };
    } catch (e) {
        console.error("Metadata fetch error", e);
        return { title: 'Fiinny Blog' };
    }
}

export default async function BlogPostPage({ params }: PageProps) {
    const { slug } = await params;
    let post: BlogPost | null = null;

    try {
        post = await BlogService.getPostBySlug(slug);
    } catch (e) {
        console.error("Blog fetch error", e);
    }

    if (!post) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white font-sans text-slate-900">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Post not found</h1>
                    <Link href="/blog" className="text-teal-600 hover:underline">Return to Blog</Link>
                </div>
            </div>
        );
    }

    // JSON-LD Structured Data for SEO
    // Extract all images from the content for SEO
    const contentImages: string[] = [];
    if (post.content) {
        const imgRegex = /<img[^>]+src="([^">]+)"/g;
        let match;
        while ((match = imgRegex.exec(post.content)) !== null) {
            // Ensure absolute URL if needed, but for now assuming relative path handled by base
            const src = match[1];
            if (src.startsWith('http')) {
                contentImages.push(src);
            } else {
                contentImages.push(`https://fiinny.com${src}`);
            }
        }
    }

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt,
        image: [
            ...(post.coverImage ? [post.coverImage.startsWith('http') ? post.coverImage : `https://fiinny.com${post.coverImage}`] : []),
            ...contentImages
        ],
        datePublished: new Date(post.date).toISOString(),
        author: {
            '@type': 'Person', // or Organization
            name: post.author,
        },
        publisher: {
            '@type': 'Organization',
            name: 'Fiinny',
            logo: {
                '@type': 'ImageObject',
                url: 'https://fiinny.com/logo.png', // Replace with actual logo URL
            },
        },
    };

    return (
        <div className="min-h-screen bg-white pb-20">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* Navigation Bar */}
            <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <Link href="/blog" className="font-bold text-xl flex items-center gap-2">
                        <MoveLeft className="w-5 h-5" />
                        Back to Blog
                    </Link>
                </div>
            </nav>

            <main className="container mx-auto px-4 max-w-4xl mt-12">
                {/* Article Header */}
                <header className="mb-12 text-center">
                    <div className="flex items-center justify-center gap-4 text-sm text-slate-500 mb-6">
                        {post.categories && post.categories.length > 0 && (
                            <span className="bg-teal-50 text-teal-700 px-3 py-1 rounded-full font-medium">
                                {post.categories[0]}
                            </span>
                        )}
                        <span>{post.readTime}</span>
                        <span>•</span>
                        <span>{post.date}</span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 leading-tight">
                        {post.title}
                    </h1>

                    <div className="flex items-center justify-center gap-2 mb-8">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">
                            {post.author[0]}
                        </div>
                        <span className="font-medium">{post.author}</span>
                    </div>

                    <div className="relative aspect-video w-full rounded-2xl overflow-hidden shadow-sm">
                        <img
                            src={post.coverImage}
                            alt={post.title}
                            className="object-cover w-full h-full"
                        />
                    </div>
                </header>

                {/* Article Content */}
                <article className="prose prose-lg prose-slate mx-auto prose-headings:font-bold prose-a:text-teal-600 hover:prose-a:text-teal-700 prose-img:rounded-xl">
                    <div
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                </article>

            </main>
        </div>
    );
}
