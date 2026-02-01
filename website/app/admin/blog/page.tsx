"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BlogService, BlogPost } from '@/lib/blog-service';
import { Plus, Edit, Trash2, ExternalLink } from 'lucide-react';

export default function AdminBlogList() {
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPosts = async () => {
        setLoading(true);
        const data = await BlogService.getPosts();
        setPosts(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchPosts();
    }, []);

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this post?")) {
            await BlogService.deletePost(id);
            await fetchPosts();
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
            {/* Simple Admin Header */}
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
                <div className="font-bold text-xl flex items-center gap-2">
                    <span>Fiinny Admin</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-teal-600">Blog</span>
                </div>
                <div className="flex gap-4">
                    <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-800">
                        Go to Site
                    </Link>
                </div>
            </header>

            <main className="container mx-auto max-w-5xl px-6 py-12">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800">Blog Posts</h1>
                    <Link
                        href="/admin/blog/create"
                        className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        Create New
                    </Link>
                </div>

                {loading ? (
                    <div className="text-center py-20 text-slate-500">Loading posts...</div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-20 text-slate-500 bg-white rounded-xl border border-slate-200">
                        <p className="mb-4">No posts found.</p>
                        <Link
                            href="/admin/blog/create"
                            className="text-teal-600 font-medium hover:underline"
                        >
                            Create your first post
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase text-slate-500 font-semibold tracking-wider">
                                    <th className="px-6 py-4">Title</th>
                                    <th className="px-6 py-4">Author</th>
                                    <th className="px-6 py-4">Created At</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {posts.map((post) => (
                                    <tr key={post.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-800">{post.title}</div>
                                            <div className="text-sm text-slate-400 font-mono mt-1">/{post.slug}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {post.author}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {/* Fallback for now, createdAt might be Timestamp or Date object depending on conversion */}
                                            {post.createdAt && (post.createdAt as any).seconds
                                                ? new Date((post.createdAt as any).seconds * 1000).toLocaleDateString()
                                                : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link
                                                    href={`/blog/${post.slug}`}
                                                    target="_blank"
                                                    className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors"
                                                    title="View Public"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Link>
                                                <Link
                                                    href={`/admin/blog/${post.id}/edit`}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Link>
                                                <button
                                                    onClick={() => post.id && handleDelete(post.id)}
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
