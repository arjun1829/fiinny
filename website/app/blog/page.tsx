"use client";

import React from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { blogPosts } from "@/lib/blog-content";
import { ArrowRight, Calendar, Clock } from "lucide-react";

export default function BlogIndex() {
    return (
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />

            <main className="pt-32 pb-16 px-6 container mx-auto max-w-6xl">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Fiinny Blog</h1>
                    <p className="text-xl text-slate-500">Insights on money, clarity, and peace of mind.</p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {blogPosts.map((post) => (
                        <Link href={`/blog/${post.slug}`} key={post.slug} className="group">
                            <article className="h-full bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden hover:shadow-xl hover:bg-white hover:border-slate-200 transition-all duration-300 flex flex-col">
                                <div className="p-8 flex-1 flex flex-col">
                                    <div className="flex gap-2 mb-4">
                                        {post.categories.map(cat => (
                                            <span key={cat} className="text-xs font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-1 rounded-md">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                    <h2 className="text-2xl font-bold mb-3 group-hover:text-teal-600 transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-slate-600 mb-6 flex-1 line-clamp-3">
                                        {post.excerpt}
                                    </p>

                                    <div className="flex items-center text-sm text-slate-400 gap-4 mt-auto pt-6 border-t border-slate-100">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-4 h-4" />
                                            {post.date}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-4 h-4" />
                                            {post.readTime}
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </Link>
                    ))}
                </div>
            </main>
        </div>
    );
}
