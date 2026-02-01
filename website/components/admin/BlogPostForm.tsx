"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BlogService, BlogPost } from '@/lib/blog-service';
import RichTextEditor from './RichTextEditor';
import ImageUploader from './ImageUploader';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface BlogPostFormProps {
    initialData?: BlogPost;
    pageTitle: string;
}

export default function BlogPostForm({ initialData, pageTitle }: BlogPostFormProps) {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const [title, setTitle] = useState(initialData?.title || '');
    const [slug, setSlug] = useState(initialData?.slug || '');
    const [content, setContent] = useState(initialData?.content || '');
    const [excerpt, setExcerpt] = useState(initialData?.excerpt || '');
    const [coverImage, setCoverImage] = useState(initialData?.coverImage || '');
    const [author, setAuthor] = useState(initialData?.author || 'Fiinny Team');
    const [readTime, setReadTime] = useState(initialData?.readTime || '3 min read');
    const [categories, setCategories] = useState(initialData?.categories.join(', ') || '');
    const [seoTitle, setSeoTitle] = useState(initialData?.seoTitle || '');
    const [seoDescription, setSeoDescription] = useState(initialData?.seoDescription || '');

    // Auto-generate slug from title if slug is empty
    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);
        if (!initialData && !slug) { // Only auto-generate for new posts if slug is untouched
            setSlug(newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const postData = {
            slug,
            title,
            excerpt,
            content,
            coverImage,
            author,
            readTime,
            categories: categories.split(',').map(c => c.trim()).filter(Boolean),
            seoTitle,
            seoDescription,
            // Use current date for display date if new, or keep existing
            date: initialData?.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        };

        try {
            if (initialData && initialData.id) {
                await BlogService.updatePost(initialData.id, postData);
            } else {
                await BlogService.createPost(postData);
            }
            router.push('/admin/blog');
            router.refresh();
        } catch (error) {
            console.error("Error saving post:", error);
            alert("Failed to save post. Please check console.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between sticky top-0 bg-slate-50 py-4 z-10 border-b border-slate-200/50 backdrop-blur-sm -mx-6 px-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin/blog" className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-800">{pageTitle}</h1>
                </div>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 bg-teal-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-teal-700 transition-all disabled:opacity-50 shadow-sm hover:shadow-md"
                >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Save Post
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Post Title"
                            value={title}
                            onChange={handleTitleChange}
                            className="w-full text-4xl font-bold bg-transparent border-0 border-b-2 border-slate-200 focus:border-teal-600 focus:ring-0 px-0 py-4 placeholder:text-slate-300 transition-colors"
                            required
                        />
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Slug (URL)</label>
                                <input
                                    type="text"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:border-teal-600 transition-colors font-mono"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-1">
                        <RichTextEditor content={content} onChange={setContent} />
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
                        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">Publishing Details</h3>

                        <ImageUploader
                            value={coverImage}
                            onChange={setCoverImage}
                            label="Cover Image"
                        />

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Excerpt</label>
                            <textarea
                                value={excerpt}
                                onChange={(e) => setExcerpt(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                placeholder="Short summary for cards..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Categories (comma separated)</label>
                            <input
                                type="text"
                                value={categories}
                                onChange={(e) => setCategories(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                placeholder="e.g. Finance, Product"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Author</label>
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Read Time</label>
                                <input
                                    type="text"
                                    value={readTime}
                                    onChange={(e) => setReadTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-2">SEO Settings</h3>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">SEO Title</label>
                            <input
                                type="text"
                                value={seoTitle}
                                onChange={(e) => setSeoTitle(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                placeholder="Defaults to post title"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">SEO Description</label>
                            <textarea
                                value={seoDescription}
                                onChange={(e) => setSeoDescription(e.target.value)}
                                rows={3}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-600 transition-colors"
                                placeholder="Defaults to excerpt"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}
