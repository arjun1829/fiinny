import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { blogPosts } from "@/lib/blog-content";
import { MoveLeft, Calendar, Clock, User } from "lucide-react";
import type { Metadata } from 'next';

interface PageProps {
    params: Promise<{
        slug: string;
    }>
}

// Generate Static Params for SSG
export async function generateStaticParams() {
    return blogPosts.map((post) => ({
        slug: post.slug,
    }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const post = blogPosts.find((p) => p.slug === slug);
    if (!post) return { title: 'Post Not Found | Fiinny' };

    return {
        title: `${post.title} | Fiinny Blog`,
        description: post.excerpt,
    };
}

export default async function BlogPost({ params }: PageProps) {
    const { slug } = await params;
    const post = blogPosts.find((p) => p.slug === slug);

    if (!post) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Post not found</h1>
                    <Link href="/blog" className="text-teal-600 hover:underline">Return to Blog</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />

            <main className="pt-32 pb-16 px-6 container mx-auto max-w-3xl">
                <Link href="/blog" className="inline-flex items-center text-slate-500 hover:text-teal-600 mb-8 transition-colors text-sm font-medium">
                    <MoveLeft className="w-4 h-4 mr-2" /> Back to Blog
                </Link>

                <article>
                    <header className="mb-12">
                        <div className="flex gap-2 mb-6">
                            {post.categories.map(cat => (
                                <span key={cat} className="text-xs font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-1 rounded-md">
                                    {cat}
                                </span>
                            ))}
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                            {post.title}
                        </h1>

                        <div className="flex items-center gap-6 text-sm text-slate-500 border-b border-slate-100 pb-8">
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                {post.author}
                            </div>
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {post.date}
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {post.readTime}
                            </div>
                        </div>
                    </header>

                    <div
                        className="prose prose-lg prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600 hover:prose-a:text-teal-600"
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                </article>

                <div className="mt-16 pt-16 border-t border-slate-100 text-center">
                    <h3 className="text-2xl font-bold mb-6">Start managing money with clarity.</h3>
                    <div className="flex justify-center gap-4">
                        <Link
                            href="/login"
                            className="bg-slate-900 text-white px-8 py-3 rounded-full font-bold hover:bg-slate-800 transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
