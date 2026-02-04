"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { BlogService, BlogPost } from "@/lib/blog-service";
import { Calendar, Clock, Search, Loader2, ArrowLeft } from "lucide-react";

export default function BlogIndex() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const loadPosts = async () => {
            setLoading(true);
            const data = await BlogService.getPosts();
            setPosts(data);
            setLoading(false);
        };
        loadPosts();
    }, []);

    const filteredPosts = posts.filter(post =>
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.categories.some(c => c.toLowerCase().includes(searchQuery.toLowerCase())) ||
        post.excerpt.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">

            {/* Premium Split Island Navigation */}
            <nav className="fixed top-6 left-0 right-0 z-50 flex justify-between items-center px-4 md:px-8 pointer-events-none">
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-teal-700 transition-colors font-bold text-sm group">
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform stroke-[3px]" />
                        Back to Home
                    </Link>
                </div>
                <div className="pointer-events-auto bg-white/80 backdrop-blur-xl rounded-full border border-white/40 shadow-xl shadow-slate-200/40 px-6 py-3 flex items-center hover:bg-white transition-colors">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative w-7 h-7 rounded-full overflow-hidden">
                            <Image src="/assets/images/logo_icon.png" alt="Fiinny" fill className="object-cover" />
                        </div>
                        <span className="text-xl font-black text-teal-950 tracking-tight group-hover:text-teal-700 transition-colors">Fiinny</span>
                    </Link>
                </div>
            </nav>

            <main className="pt-40 pb-24 px-4 sm:px-6 container mx-auto max-w-7xl">
                <div className="text-center mb-16 max-w-2xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
                        The Finance Log
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight text-slate-900">
                        Fiinny Blog
                    </h1>
                    <p className="text-xl text-slate-500 font-medium leading-relaxed">
                        Insights on money, clarity, and peace of mind. <br className="hidden md:block" /> No jargon, just clear thinking.
                    </p>
                </div>

                {/* Search Bar */}
                <div className="max-w-xl mx-auto mb-20 relative z-10">
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Search articles..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-14 pr-6 py-4 rounded-full bg-white border border-slate-200 focus:outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all shadow-xl shadow-slate-200/40 font-medium text-slate-700 placeholder:text-slate-400"
                        />
                        <Search className="w-6 h-6 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-teal-600 transition-colors" />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                    </div>
                ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 font-medium bg-white rounded-3xl border border-slate-100 shadow-sm max-w-lg mx-auto">
                        No posts found matching your search.
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredPosts.map((post) => (
                            <Link href={`/blog/${post.slug}`} key={post.id || post.slug} className="group">
                                <article className="h-full bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-2 transition-all duration-300 flex flex-col relative z-0">
                                    {post.coverImage && (
                                        <div className="h-56 overflow-hidden bg-slate-100 relative">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={post.coverImage}
                                                alt={post.title}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent opacity-60 pointer-events-none" />
                                        </div>
                                    )}
                                    <div className="p-8 flex-1 flex flex-col">
                                        <div className="flex flex-wrap gap-2 mb-6">
                                            {post.categories.map(cat => (
                                                <span key={cat} className="text-[10px] font-black uppercase tracking-widest text-teal-700 bg-teal-50 px-3 py-1.5 rounded-full border border-teal-100">
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                        <h2 className="text-2xl font-bold mb-4 text-slate-900 group-hover:text-teal-700 transition-colors leading-tight">
                                            {post.title}
                                        </h2>
                                        <p className="text-slate-500 mb-8 flex-1 line-clamp-3 leading-relaxed font-medium">
                                            {post.excerpt}
                                        </p>

                                        <div className="flex items-center text-xs font-bold text-slate-400 gap-6 mt-auto pt-6 border-t border-slate-50 uppercase tracking-wider">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4" />
                                                {post.date}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4" />
                                                {post.readTime}
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
